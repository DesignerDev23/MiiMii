import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface Provider {
  code: string;
  name: string;
  logo?: string;
}

interface Category {
  code: string;
  name: string;
  icon: string;
}

const BillsScreen = ({ navigation, route }: any) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadProviders(selectedCategory);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch('https://api.chatmiimii.com/api/mobile/bills/categories', {
        headers: {
          'Authorization': `Bearer ${route.params?.token || ''}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async (category: string) => {
    try {
      setLoading(true);
      const response = await fetch(`https://api.chatmiimii.com/api/mobile/bills/providers/${category}`, {
        headers: {
          'Authorization': `Bearer ${route.params?.token || ''}`,
        },
      });
      const data = await response.json();
      if (data.success && data.providers) {
        setProviders(data.providers.providers || []);
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSelect = (provider: Provider) => {
    navigation.navigate('BillDetails', {
      category: selectedCategory,
      provider: provider.code,
      providerName: provider.name,
      token: route.params?.token,
    });
  };

  const handleLogoError = (code: string) => {
    setLogoErrors(prev => new Set(prev).add(code));
  };

  const getCategoryIcon = (icon: string) => {
    // Map emoji icons to Ionicons
    const iconMap: { [key: string]: string } = {
      '⚡': 'flash',
      '📺': 'tv',
      '🌐': 'globe',
      '💧': 'water',
    };
    return iconMap[icon] || 'grid';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Beautiful Header - Similar to Chat Screen */}
      <LinearGradient
        colors={['#6366f1', '#8b5cf6', '#a855f7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Pay Bills</Text>
            <Text style={styles.headerSubtitle}>Choose a service provider</Text>
          </View>
          
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="search" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Selection */}
        {!selectedCategory && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Category</Text>
            <View style={styles.categoryGrid}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.code}
                  style={styles.categoryCard}
                  onPress={() => setSelectedCategory(category.code)}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={['#f0f9ff', '#e0f2fe']}
                    style={styles.categoryGradient}
                  >
                    <View style={styles.categoryIconContainer}>
                      <Text style={styles.categoryEmoji}>{category.icon}</Text>
                    </View>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#6366f1"
                      style={styles.categoryArrow}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Provider Selection */}
        {selectedCategory && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TouchableOpacity
                onPress={() => setSelectedCategory(null)}
                style={styles.backToCategories}
              >
                <Ionicons name="arrow-back" size={20} color="#6366f1" />
                <Text style={styles.backToCategoriesText}>Back to Categories</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.sectionTitle}>
              Select {categories.find(c => c.code === selectedCategory)?.name || 'Provider'}
            </Text>
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
              </View>
            ) : (
              <View style={styles.providerGrid}>
                {providers.map((provider) => (
                  <TouchableOpacity
                    key={provider.code}
                    style={styles.providerCard}
                    onPress={() => handleProviderSelect(provider)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.providerCardContent}>
                      {/* Provider Logo - Fixed z-index issue */}
                      <View style={styles.logoContainer}>
                        {provider.logo && !logoErrors.has(provider.code) ? (
                          <Image
                            source={{ uri: provider.logo }}
                            style={styles.providerLogo}
                            onError={() => handleLogoError(provider.code)}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={styles.fallbackLogo}>
                            <Text style={styles.fallbackLogoText}>
                              {provider.name.substring(0, 2).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      {/* Provider Name */}
                      <Text style={styles.providerName} numberOfLines={2}>
                        {provider.name}
                      </Text>
                      
                      {/* Arrow Indicator */}
                      <View style={styles.providerArrow}>
                        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                      </View>
                    </View>
                    
                    {/* Card Shadow Effect */}
                    <View style={styles.cardShadow} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    fontWeight: '400',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  backToCategories: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  backToCategoriesText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: (width - 48) / 2,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryGradient: {
    padding: 20,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  categoryIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryEmoji: {
    fontSize: 32,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  categoryArrow: {
    marginTop: 4,
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  providerCard: {
    width: (width - 48) / 2,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
  },
  providerCardContent: {
    padding: 16,
    alignItems: 'center',
    minHeight: 160,
    justifyContent: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  providerLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  fallbackLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#c7d2fe',
  },
  fallbackLogoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6366f1',
  },
  providerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  providerArrow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
  },
  cardShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BillsScreen;

