import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  tireTrackingSystem: 'Tire Tracking System',
  search: 'Search...',
  sortBy: 'Sort by',
  brand: 'Brand',
  size: 'Size',
  year: 'Year',
  darkMode: 'Dark Mode',
  addNewTire: 'Add New Tire',
  exportToExcel: 'Export to Excel',
  details: 'Details',
  salePrice: 'Sale Price (TZS)',
  share: 'Share',
  edit: 'Edit',
  delete: 'Delete',
  generateQRCode: 'Generate QR Code',
  viewSalesHistory: 'View Sales History',
};

const sw = {
  tireTrackingSystem: 'Mfumo wa Kufuatilia Matairi',
  search: 'Tafuta...',
  sortBy: 'Panga kwa',
  brand: 'Chapa',
  size: 'Saizi',
  year: 'Mwaka',
  darkMode: 'Mandhari Meusi',
  addNewTire: 'Ongeza Tairi Jipya',
  exportToExcel: 'Pakua Excel',
  details: 'Maelezo',
  salePrice: 'Bei ya Mauzo (TZS)',
  share: 'Shiriki',
  edit: 'Hariri',
  delete: 'Futa',
  generateQRCode: 'Tengeneza QR',
  viewSalesHistory: 'Angalia Historia ya Mauzo',
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sw: { translation: sw },
    },
    lng: (() => {
      try {
        return localStorage.getItem('app_lang') === 'sw' ? 'sw' : 'en';
      } catch (e) {
        return 'en';
      }
    })(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;