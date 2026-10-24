import { createSlice } from '@reduxjs/toolkit';

/**
 * uiSlice — global layout + ephemeral UI state.
 * Nothing here is ever persisted to the DB; theme persists to localStorage
 * via the ThemeProvider, not Supabase.
 */

let toastSeq = 0;
const nextToastId = () => `t${Date.now()}_${++toastSeq}`;

const initialState = {
  sidebarCollapsed: false,
  mobileNavOpen: false,
  theme: 'system', // 'light' | 'dark' | 'system'
  chatPanelOpen: false, // M8 AI assistant drawer
  activeModal: null, // { type: 'confirmDelete' | 'reviewCorrection' | ..., props: {} }
  toasts: [], // { id, title, description, variant: 'success'|'error'|'info' }
  unreadNotifications: 0, // incremented by the realtime listener
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action) {
      state.sidebarCollapsed = Boolean(action.payload);
    },
    setMobileNavOpen(state, action) {
      state.mobileNavOpen = Boolean(action.payload);
    },
    setTheme(state, action) {
      state.theme = action.payload; // 'light' | 'dark' | 'system'
    },
    setChatPanelOpen(state, action) {
      state.chatPanelOpen = Boolean(action.payload);
    },
    openModal(state, action) {
      state.activeModal = {
        type: action.payload.type,
        props: action.payload.props ?? {},
      };
    },
    closeModal(state) {
      state.activeModal = null;
    },
    pushToast(state, action) {
      const toast = {
        id: nextToastId(),
        title: action.payload.title ?? '',
        description: action.payload.description ?? '',
        variant: action.payload.variant ?? 'info',
      };
      state.toasts.push(toast);
      // Keep the stack short; ToastHost animates removal.
      if (state.toasts.length > 4) state.toasts.shift();
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setUnreadNotifications(state, action) {
      state.unreadNotifications = Math.max(0, Number(action.payload) || 0);
    },
    incrementUnreadNotifications(state) {
      state.unreadNotifications += 1;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarCollapsed,
  setMobileNavOpen,
  setTheme,
  setChatPanelOpen,
  openModal,
  closeModal,
  pushToast,
  dismissToast,
  setUnreadNotifications,
  incrementUnreadNotifications,
} = uiSlice.actions;

export const selectActiveModal = (state) => state.ui.activeModal;

export default uiSlice.reducer;
