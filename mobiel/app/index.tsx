import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform 
} from 'react-native';
import { SafeAreaView as SafeAreaContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebaseConfig';

// Define the menu types
interface SubMenuItem {
  href: string;
  label: string;
  id: string;
  module?: string;
}

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  module?: string;
  subItems?: SubMenuItem[];
}

const getIconName = (name: string): keyof typeof Ionicons.glyphMap => {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    Folder: 'folder-outline',
    Users: 'people-outline',
    Truck: 'car-outline',
    ClipboardList: 'clipboard-outline',
    Bell: 'notifications-outline',
    MapPin: 'location-outline',
    Layers: 'layers-outline',
    FileWarning: 'document-text-outline',
    Navigation: 'navigate-outline',
    Cpu: 'hardware-chip-outline',
    Link2: 'link-outline',
    Mail: 'mail-outline',
    ShieldCheck: 'shield-checkmark-outline',
    User: 'person-outline',
  };
  return map[name] || 'grid-outline';
};

// 1:1 copy from src/lib/menu-config.ts
const allMenuItems: MenuItem[] = [
  { 
    href: '/projects', 
    label: 'Projecten', 
    icon: 'Folder', 
    module: 'projects',
    subItems: [
      { href: '/projects', label: 'Projectbeheer', id: 'project' },
      { href: '/annual-planning', label: 'Jaarplanning', id: 'annual-planning' },
      { href: '/bestanden', label: 'Documenten', id: 'bestanden' },
    ]
  },
  { 
    href: '/employees', 
    label: 'Personeel', 
    icon: 'Users', 
    module: 'employees',
    subItems: [
      { href: '/employees', label: 'Medewerkers', id: 'overzicht' },
      { href: '/work-planning', label: 'Werkplanning', id: 'work-planning', module: 'workPlanning' },
    ]
  },
  { href: '/vehicles', label: 'Wagenpark', icon: 'Truck', module: 'vehicles' },
  { href: '/weekly-reports', label: 'Weekstaten', icon: 'ClipboardList', module: 'weeklyReports' },
  { 
    href: '/issues', 
    label: 'Meldingen', 
    icon: 'Bell', 
    module: 'issues',
    subItems: [
      { href: '/navigation-module?type=meldingen', label: 'Werkbonnen', id: 'werkbonnen' },
      { href: '/issues/open', label: 'Openstaand', id: 'open' },
      { href: '/issues/new', label: 'Melding maken', id: 'new' },
      { href: '/issues/portal', label: 'Portaal', id: 'portal' },
      { href: '/issues/archive', label: 'Archief', id: 'archive' },
    ]
  },
  { 
    href: '/objects', 
    label: 'Objecten', 
    icon: 'MapPin', 
    module: 'objects',
    subItems: [
      { href: '/objects', label: 'Overzicht', id: 'overzicht' },
      { href: '/objects?action=import', label: 'Import', id: 'import' },
      { href: '/objects?action=export', label: 'Export', id: 'export' },
    ]
  },
  { href: '/gis-data', label: 'GIS-data', icon: 'Layers', module: 'gisData' },
  { href: '/spec-reports', label: 'Bestek', icon: 'FileWarning', module: 'specReports' },
  { 
    href: '/navigation-module', 
    label: 'Navigatie', 
    icon: 'Navigation', 
    module: 'navigation',
    subItems: [
      { href: '/navigation-module?type=veegroutes', label: 'Veegroutes', id: 'veegroutes' },
      { href: '/navigation-module?type=prullenbakken', label: 'Prullenbakken', id: 'prullenbakken' },
      { href: '/navigation-module/history', label: 'Historie', id: 'history' },
      { href: '/navigation-module/assignment', label: 'Toewijzen', id: 'assignment' },
    ]
  },
  { href: '/iot', label: 'Internet of Things', icon: 'Cpu', module: 'iot' },
  { href: '/api-integrations', label: 'API Koppelingen', icon: 'Link2', module: 'apiIntegrations' },
  { href: '/mail', label: 'Mail', icon: 'Mail', module: 'mail' },
  { href: '/users', label: 'Gebruikers', icon: 'ShieldCheck', module: 'users' },
  { href: '/profile', label: 'Mijn Profiel', icon: 'User' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [activeModule, setActiveModule] = useState<MenuItem | null>(null);
  const [newCount, setNewCount] = useState<number>(0);

  useEffect(() => {
    // Live update for notifications count just like Next.js portalQuery
    const q = query(
      collection(firestore, 'meldingen'), 
      where('status', '==', 'Nieuw')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNewCount(snapshot.docs.length);
    }, (error) => {
      console.log("Error fetching notifications:", error);
    });

    return () => unsubscribe();
  }, []);

  const handleCardClick = (item: MenuItem) => {
    if (item.subItems && item.subItems.length > 0) {
      setActiveModule(item);
    } else {
      // In a real app we would navigate, for now we show an alert
      alert(`Navigeren naar ${item.href}`);
    }
  };

  const handleSubItemClick = (sub: SubMenuItem) => {
    alert(`Navigeren naar ${sub.href}`);
  };

  const renderCard = (
    title: string, 
    iconName: keyof typeof Ionicons.glyphMap, 
    actionText: string, 
    onPress: () => void
  ) => (
    <TouchableOpacity 
      key={title} 
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Ionicons name={iconName} size={24} color="#0f172a" />
        </View>
        <View style={styles.arrowContainer}>
          <Ionicons name="chevron-forward" size={16} color="#0f172a" />
        </View>
      </View>
      
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{actionText}</Text>
      </View>

      {/* Badge for "Meldingen" or "Portaal" */}
      {(title === 'Meldingen' || title === 'Portaal') && newCount > 0 && (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{newCount}</Text>
        </View>
      )}

      <Ionicons 
        name={iconName} 
        size={96} 
        color="#0f172a" 
        style={styles.bgIcon} 
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaContext style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        
        <View style={styles.headerRow}>
          {activeModule && (
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => setActiveModule(null)}
            >
              <Ionicons name="arrow-back" size={24} color="#0f172a" />
            </TouchableOpacity>
          )}
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>
              {activeModule ? activeModule.label : 'MENU'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeModule ? `SUBMENU VOOR ${activeModule.label.toUpperCase()}` : 'SELECTEER EEN MODULE'}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          {!activeModule 
            ? allMenuItems.map((item) => renderCard(
                item.label, 
                getIconName(item.icon), 
                item.subItems ? 'BEKIJK OPTIES' : 'OPENEN', 
                () => handleCardClick(item)
              ))
            : activeModule.subItems?.map((sub) => renderCard(
                sub.label, 
                getIconName(activeModule.icon), 
                'UITVOEREN', 
                () => handleSubItemClick(sub)
              ))
          }
        </View>

      </ScrollView>
    </SafeAreaContext>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  backButton: {
    backgroundColor: '#ffffff',
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTexts: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#ffffff',
    width: '48%',
    height: 144,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderRadius: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  iconContainer: {
    backgroundColor: '#f8fafc',
    padding: 10,
  },
  arrowContainer: {
    backgroundColor: '#f8fafc',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    zIndex: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  cardDescription: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#ef4444', // Tailwind destructive red
    height: 24,
    minWidth: 24,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  bgIcon: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    opacity: 0.03,
    zIndex: 1,
  },
});
