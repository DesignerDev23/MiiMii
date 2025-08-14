# MiiMii.AI Deployment Guide

This guide provides detailed instructions for deploying the MiiMii.AI platform to production environments.

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- PostgreSQL 12.x or higher
- Domain name with SSL certificate
- API credentials for all services

### Environment Setup

1. **Create production environment file**
   ```bash
   cp .env.example .env.production
   ```

2. **Configure environment variables**
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/miimii_prod
   
   # WhatsApp Business API
   BOT_ACCESS_TOKEN=your_whatsapp_access_token
   BOT_PHONE_NUMBER_ID=your_phone_number_id
   WEBHOOK_SECRET=your_webhook_secret
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # Bilal API
   BILAL_BASE_URL=https://bilalsadasub.com/api
   BILAL_USERNAME=your_bilal_username
   BILAL_PASSWORD=your_bilal_password
   
   # BellBank API
   BANK_CONSUMER_KEY=your_bellbank_consumer_key
   BANK_CONSUMER_SECRET=your_bellbank_consumer_secret
   BANK_ENVIRONMENT=production
   
   # Server
   PORT=3000
   NODE_ENV=production
   ```

## 🐳 Docker Deployment

### 1. Build Docker Image
```bash
# Build the production image
docker build -t miimii-ai:latest .

# Tag for registry (if using private registry)
docker tag miimii-ai:latest your-registry.com/miimii-ai:latest
```

### 2. Run Container
```bash
# Run with environment file
docker run -d \
  --name miimii-ai \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  miimii-ai:latest

# Or run with environment variables
docker run -d \
  --name miimii-ai \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e BOT_ACCESS_TOKEN="..." \
  --restart unless-stopped \
  miimii-ai:latest
```

### 3. Docker Compose (Recommended)
Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
      - ./assets:/app/assets

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: miimii_prod
      POSTGRES_USER: miimii_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up -d
```

## ☁️ Cloud Deployment

### DigitalOcean App Platform

1. **Connect Repository**
   - Push code to GitHub
   - Connect repository in DigitalOcean App Platform

2. **Configure App**
   ```yaml
   # .digitalocean/app.yaml
   name: miimii-ai
   services:
   - name: web
     source_dir: /
     github:
       repo: your-username/miimii-ai
       branch: main
     run_command: npm start
     environment_slug: node-js
     instance_count: 1
     instance_size_slug: basic-xxs
     envs:
     - key: NODE_ENV
       value: production
     - key: DATABASE_URL
       value: ${db.DATABASE_URL}
     - key: BOT_ACCESS_TOKEN
       value: ${BOT_ACCESS_TOKEN}
     - key: BOT_PHONE_NUMBER_ID
       value: ${BOT_PHONE_NUMBER_ID}
     - key: WEBHOOK_SECRET
       value: ${WEBHOOK_SECRET}
     - key: OPENAI_API_KEY
       value: ${OPENAI_API_KEY}
     - key: BILAL_BASE_URL
       value: https://bilalsadasub.com/api
     - key: BILAL_USERNAME
       value: ${BILAL_USERNAME}
     - key: BILAL_PASSWORD
       value: ${BILAL_PASSWORD}
     - key: BANK_CONSUMER_KEY
       value: ${BANK_CONSUMER_KEY}
     - key: BANK_CONSUMER_SECRET
       value: ${BANK_CONSUMER_SECRET}
     - key: BANK_ENVIRONMENT
       value: production

   databases:
   - name: db
     engine: PG
     version: "14"
   ```

3. **Deploy**
   ```bash
   doctl apps create --spec .digitalocean/app.yaml
   ```

### AWS ECS

1. **Create ECS Cluster**
   ```bash
   aws ecs create-cluster --cluster-name miimii-ai
   ```

2. **Create Task Definition**
   ```json
   {
     "family": "miimii-ai",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "256",
     "memory": "512",
     "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
     "containerDefinitions": [
       {
         "name": "miimii-ai",
         "image": "your-account.dkr.ecr.region.amazonaws.com/miimii-ai:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "NODE_ENV",
             "value": "production"
           }
         ],
         "secrets": [
           {
             "name": "DATABASE_URL",
             "valueFrom": "arn:aws:secretsmanager:region:account:secret:miimii/database"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/miimii-ai",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

3. **Deploy Service**
   ```bash
   aws ecs create-service \
     --cluster miimii-ai \
     --service-name miimii-ai-service \
     --task-definition miimii-ai:1 \
     --desired-count 1 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-12345],securityGroups=[sg-12345],assignPublicIp=ENABLED}"
   ```

## 🔧 Production Configuration

### Database Setup

1. **Create Production Database**
   ```sql
   CREATE DATABASE miimii_prod;
   CREATE USER miimii_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE miimii_prod TO miimii_user;
   ```

2. **Run Migrations**
   ```bash
   npm run db:migrate
   ```

3. **Seed Initial Data**
   ```bash
   npm run db:seed
   ```

### SSL Configuration

1. **Install Certbot**
   ```bash
   sudo apt-get update
   sudo apt-get install certbot
   ```

2. **Generate SSL Certificate**
   ```bash
   sudo certbot certonly --standalone -d your-domain.com
   ```

3. **Configure Nginx**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name your-domain.com;

       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### WhatsApp Webhook Configuration

1. **Set Webhook URL**
   ```
   https://your-domain.com/webhook/whatsapp
   ```

2. **Verify Webhook**
   - WhatsApp will send a verification request
   - Ensure your server responds correctly

3. **Test Webhook**
   ```bash
   curl -X POST https://your-domain.com/webhook/whatsapp \
     -H "Content-Type: application/json" \
     -d '{"test": "message"}'
   ```

## 📊 Monitoring & Logging

### Application Monitoring

1. **Health Check Endpoint**
   ```bash
   curl https://your-domain.com/health
   ```

2. **Log Monitoring**
   ```bash
   # View application logs
   docker logs miimii-ai

   # Follow logs in real-time
   docker logs -f miimii-ai
   ```

3. **Database Monitoring**
   ```sql
   -- Check active connections
   SELECT count(*) FROM pg_stat_activity;

   -- Check slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;
   ```

### Performance Monitoring

1. **Memory Usage**
   ```bash
   docker stats miimii-ai
   ```

2. **CPU Usage**
   ```bash
   top -p $(pgrep -f "node.*app.js")
   ```

3. **Disk Usage**
   ```bash
   df -h
   du -sh /var/lib/docker/volumes/
   ```

## 🔒 Security Checklist

- [ ] SSL certificate installed and configured
- [ ] Environment variables secured
- [ ] Database password is strong
- [ ] Firewall rules configured
- [ ] Regular security updates enabled
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting set up
- [ ] Rate limiting configured
- [ ] Input validation enabled
- [ ] Error messages don't expose sensitive data

## 🚨 Troubleshooting

### Common Issues

1. **Application Won't Start**
   ```bash
   # Check logs
   docker logs miimii-ai

   # Check environment variables
   docker exec miimii-ai env | grep -E "(DATABASE|BOT|BILAL|BANK)"
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connection
   docker exec miimii-ai npm run db:test

   # Check database status
   docker exec postgres pg_isready
   ```

3. **WhatsApp Webhook Issues**
   ```bash
   # Check webhook endpoint
   curl -X GET https://your-domain.com/webhook/whatsapp

   # Verify webhook signature
   # Check logs for webhook errors
   ```

4. **High Memory Usage**
   ```bash
   # Check memory usage
   docker stats miimii-ai

   # Restart container if needed
   docker restart miimii-ai
   ```

### Performance Optimization

1. **Enable Gzip Compression**
   ```javascript
   app.use(compression());
   ```

2. **Configure Caching**
   ```javascript
   app.use(express.static('public', { maxAge: '1h' }));
   ```

3. **Database Connection Pooling**
   ```javascript
   const sequelize = new Sequelize(databaseUrl, {
     pool: {
       max: 20,
       min: 5,
       acquire: 30000,
       idle: 10000
     }
   });
   ```

## 📞 Support

For deployment issues:
- Check the troubleshooting section above
- Review application logs
- Contact support team
- Create an issue in the repository

## 🔄 Updates & Maintenance

### Regular Maintenance

1. **Weekly**
   - Check application logs
   - Monitor performance metrics
   - Review error rates

2. **Monthly**
   - Update dependencies
   - Review security patches
   - Backup verification

3. **Quarterly**
   - Performance optimization
   - Security audit
   - Capacity planning

### Update Process

1. **Backup Current Version**
   ```bash
   docker tag miimii-ai:latest miimii-ai:backup-$(date +%Y%m%d)
   ```

2. **Deploy New Version**
   ```bash
   docker pull miimii-ai:latest
   docker-compose up -d
   ```

3. **Verify Deployment**
   ```bash
   curl https://your-domain.com/health
   docker logs miimii-ai
   ```

4. **Rollback if Needed**
   ```bash
   docker tag miimii-ai:backup-$(date +%Y%m%d) miimii-ai:latest
   docker-compose up -d
   ```

