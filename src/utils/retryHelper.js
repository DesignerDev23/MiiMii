const logger = require('./logger');

class RetryHelper {
  /**
   * Execute a function with retry logic
   * @param {Function} fn - The function to execute
   * @param {Object} options - Retry options
   * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
   * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
   * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 30000)
   * @param {number} options.backoffMultiplier - Multiplier for exponential backoff (default: 2)
   * @param {Array} options.retryableErrors - Array of error types/codes to retry on
   * @param {Function} options.shouldRetry - Custom function to determine if error should be retried
   * @param {string} options.operationName - Name of the operation for logging
   * @returns {Promise} - Result of the function execution
   */
  static async executeWithRetry(fn, options = {}) {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      retryableErrors = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'NETWORK_ERROR'],
      shouldRetry = null,
      operationName = 'operation'
    } = options;

    let lastError;
    let attempt = 1;

    while (attempt <= maxAttempts) {
      try {
        logger.debug(`${operationName}: Attempt ${attempt}/${maxAttempts}`);
        const result = await fn();
        
        if (attempt > 1) {
          logger.info(`${operationName}: Succeeded on attempt ${attempt}/${maxAttempts}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if we should retry this error
        const shouldRetryThisError = shouldRetry 
          ? shouldRetry(error, attempt) 
          : this.isRetryableError(error, retryableErrors);

        if (attempt === maxAttempts || !shouldRetryThisError) {
          logger.error(`${operationName}: Failed after ${attempt} attempts`, {
            error: error.message,
            stack: error.stack,
            finalAttempt: attempt === maxAttempts,
            retryable: shouldRetryThisError
          });
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          baseDelay * Math.pow(backoffMultiplier, attempt - 1) + Math.random() * 1000,
          maxDelay
        );

        logger.warn(`${operationName}: Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
          error: error.message,
          nextAttempt: attempt + 1
        });

        await this.sleep(delay);
        attempt++;
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable based on error codes/types
   * @param {Error} error - The error to check
   * @param {Array} retryableErrors - Array of retryable error codes/types
   * @returns {boolean} - Whether the error is retryable
   */
  static isRetryableError(error, retryableErrors) {
    // Network/connection errors
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // HTTP status codes that are retryable
    if (error.response && error.response.status) {
      const retryableStatusCodes = [408, 429, 502, 503, 504];
      return retryableStatusCodes.includes(error.response.status);
    }

    // Axios specific errors
    if (error.message) {
      const retryableMessages = [
        'timeout',
        'network error',
        'connection reset',
        'connection refused',
        'temporary failure',
        'service unavailable',
        'internal server error'
      ];
      
      const lowerMessage = error.message.toLowerCase();
      return retryableMessages.some(msg => lowerMessage.includes(msg));
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after the specified time
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry wrapper for API calls
   * @param {Object} options - Default retry options for this wrapper
   * @returns {Function} - Function that wraps API calls with retry logic
   */
  static createApiRetryWrapper(options = {}) {
    const defaultOptions = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'],
      ...options
    };

    return async (apiCall, callSpecificOptions = {}) => {
      const mergedOptions = { ...defaultOptions, ...callSpecificOptions };
      return this.executeWithRetry(apiCall, mergedOptions);
    };
  }

  /**
   * Retry specifically for bank/financial API calls
   * @param {Function} apiCall - The API call function
   * @param {Object} options - Retry options
   * @returns {Promise} - Result of the API call
   */
  static async retryBankApiCall(apiCall, options = {}) {
    const bankRetryOptions = {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      backoffMultiplier: 1.5,
      shouldRetry: (error, attempt) => {
        // Don't retry authentication errors
        if (error.response && [401, 403].includes(error.response.status)) {
          return false;
        }
        
        // Don't retry client errors (400-499) except specific ones
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          return [408, 429].includes(error.response.status);
        }
        
        // Retry server errors and network issues
        return true;
      },
      operationName: 'bank_api_call',
      ...options
    };

    return this.executeWithRetry(apiCall, bankRetryOptions);
  }

  /**
   * Retry for webhook delivery
   * @param {Function} webhookCall - The webhook delivery function
   * @param {Object} options - Retry options
   * @returns {Promise} - Result of the webhook delivery
   */
  static async retryWebhookDelivery(webhookCall, options = {}) {
    const webhookRetryOptions = {
      maxAttempts: 3,
      baseDelay: 5000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      operationName: 'webhook_delivery',
      ...options
    };

    return this.executeWithRetry(webhookCall, webhookRetryOptions);
  }

  /**
   * Circuit breaker pattern implementation
   */
  static createCircuitBreaker(options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000,
      monitoringPeriod = 60000,
      operationName = 'circuit_breaker'
    } = options;

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failureCount = 0;
    let lastFailureTime = null;
    let successCount = 0;

    return async (fn) => {
      if (state === 'OPEN') {
        if (Date.now() - lastFailureTime > resetTimeout) {
          state = 'HALF_OPEN';
          successCount = 0;
          logger.info(`${operationName}: Circuit breaker transitioning to HALF_OPEN`);
        } else {
          throw new Error(`Circuit breaker is OPEN for ${operationName}`);
        }
      }

      try {
        const result = await fn();
        
        if (state === 'HALF_OPEN') {
          successCount++;
          if (successCount >= 3) {
            state = 'CLOSED';
            failureCount = 0;
            logger.info(`${operationName}: Circuit breaker reset to CLOSED`);
          }
        } else {
          failureCount = Math.max(0, failureCount - 1);
        }
        
        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = Date.now();
        
        if (failureCount >= failureThreshold) {
          state = 'OPEN';
          logger.error(`${operationName}: Circuit breaker opened after ${failureCount} failures`);
        }
        
        throw error;
      }
    };
  }
}

module.exports = RetryHelper;