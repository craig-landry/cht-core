import { createSelector } from '@ngrx/store';

const getGlobalState = (state) => state.global || {};
const getServicesState = (state) => state.services || {};
const getReportsState = (state) => state.reports || {};
const getMessagesState = (state) => state.messages || {};
const getContactsState = (state) => state || {};

export const Selectors = {
  // global
  getActionBar: createSelector(getGlobalState, (globalState) => globalState.actionBar),
  getLoadingSubActionBar: createSelector(getGlobalState, (globalState) => globalState.loadingSubActionBar),
  getReplicationStatus: createSelector(getGlobalState, (globalState) => globalState.replicationStatus),
  getAndroidAppVersion:  createSelector(getGlobalState, (globalState) => globalState.androidAppVersion),
  getCurrentTab: createSelector(getGlobalState, (globalState) => globalState.currentTab),
  getSnackbarContent: createSelector(getGlobalState, (globalState) => globalState.snackbarContent),
  getLoadingContent: createSelector(getGlobalState, (globalState) => globalState.loadingContent),
  getMinimalTabs: createSelector(getGlobalState, (globalState) => globalState.minimalTabs),
  getShowContent: createSelector(getGlobalState, (globalState) => globalState.showContent),
  getSelectMode: createSelector(getGlobalState, (globalState) => globalState.selectMode),
  getShowActionBar: createSelector(getGlobalState, (globalState) => globalState.showActionBar),
  getForms: createSelector(getGlobalState, (globalState) => globalState.forms),
  getFilters: createSelector(getGlobalState, (globalState) => globalState.filters),
  getIsAdmin: createSelector(getGlobalState, (globalState) => globalState.isAdmin),
  getCancelCallback: createSelector(getGlobalState, (globalState) => globalState.cancelCallback),
  getTitle: createSelector(getGlobalState, (globalState) => globalState.title),

  // services
  getLastChangedDoc: createSelector(getServicesState, (servicesState) => servicesState.lastChangedDoc),

  // reports
  getReportsList: createSelector(getReportsState, (reportsState) => reportsState.reports),
  getListReport: createSelector(getReportsState, (reportsState, props:any={}) => {
    if (!props.id) {
      return;
    }
    if (!reportsState.reportsById.has(props.id)) {
      return;
    }

    return reportsState.reportsById.get(props.id);
  }),
  listContains: createSelector(getReportsState, (reportsState) => {
    return (id) => reportsState.reportsById.has(id);
  }),
  getSelectedReports: createSelector(getReportsState, (reportsState) => reportsState.selected),
  getSelectedReportsSummaries: createSelector(getReportsState, (reportsState) => {
    return reportsState.selected?.map(item => item.formatted || item.summary);
  }),

  // messages
  getMessagesError: createSelector(getMessagesState, (messagesState) => messagesState.error),
  getSelectedConversation: createSelector(getMessagesState, (messagesState) => messagesState.selected),
  getConversations: createSelector(getMessagesState, (messagesState) => messagesState.conversations),

  // contacts
  getContactsList: createSelector(getContactsState, (contactsState) => contactsState.contacts.contacts),
  contactListContains: createSelector(getContactsState, (contactsState) => {
    return (id) => contactsState.reportsById.has(id);
  }),
};
/*

// Global
const getActionBar = state => getGlobalState(state).actionBar;
const getEnketoStatus = state => getGlobalState(state).enketoStatus;
const getEnketoEditedStatus = state => getGlobalState(state).enketoStatus.edited;
const getEnketoSavingStatus = state => getGlobalState(state).enketoStatus.saving;
const getEnketoError = state => getGlobalState(state).enketoStatus.error;

const getLoadingSubActionBar = state => getGlobalState(state).loadingSubActionBar;

const getUnreadCount = state => getGlobalState(state).unreadCount;
const getPrivacyPolicyAccepted = state => getGlobalState(state).privacyPolicyAccepted;
const getShowPrivacyPolicy = state => getGlobalState(state).showPrivacyPolicy;

// Analytics
const getAnalyticsState = state => state.analytics;
const getSelectedAnalytics = state => getAnalyticsState(state).selected;

// Contacts
const getContactsState = state => state.contacts;
const getContactsLoadingSummary = state => getContactsState(state).loadingSummary;
const getLoadingSelectedContactChildren = state => getContactsState(state).loadingSelectedChildren;
const getLoadingSelectedContactReports = state => getContactsState(state).loadingSelectedReports;
const getSelectedContact = state => getContactsState(state).selected;
const getSelectedContactDoc = reselect.createSelector(
  getSelectedContact,
  selected => selected && selected.doc
);

// Messages
const getMessagesState = state => state.messages;
const getMessagesError = state => getMessagesState(state).error;
const getSelectedConversation = state => getMessagesState(state).selected;
const getConversations = state => getMessagesState(state).conversations;

// Reports
const getReportsState = state => state.reports;
const getSelectedReports = state => getReportsState(state).selected;
const getSelectedReportsValidChecks = reselect.createSelector(
  getSelectedReports,
  selected => selected.map(item => item.summary && item.summary.valid || item.formatted &&
    !(item.formatted.errors && item.formatted.errors.length))
);
const getSelectedReportsDocs = reselect.createSelector(
  getSelectedReports,
  selected => selected.map(item => item.doc || item.summary)
);
const getVerifyingReport = state => getReportsState(state).verifyingReport;

// Tasks
const getTasksState = state => state.tasks;
const getSelectedTask = state => getTasksState(state).selected;
const getLoadTasks = state => getTasksState(state).loaded;

// Target Aggregates
const getTargetAggregatesState = state => state.targetAggregates;
const getTargetAggregates = state => getTargetAggregatesState(state).targetAggregates;
const getSelectedTargetAggregate = state => getTargetAggregatesState(state).selected;
const getTargetAggregatesError = state => getTargetAggregatesState(state).error;


angular.module('inboxServices').constant('Selectors', {
  getGlobalState,
  getActionBar,
  getAndroidAppVersion,
  getEnketoStatus,
  getEnketoEditedStatus,
  getEnketoSavingStatus,
  getEnketoError,
  getLoadingSubActionBar,
  getShowActionBar,
  getUnreadCount,
  getPrivacyPolicyAccepted,
  getShowPrivacyPolicy,

  getAnalyticsState,
  getSelectedAnalytics,

  getContactsState,
  getContactsLoadingSummary,
  getLoadingSelectedContactChildren,
  getLoadingSelectedContactReports,
  getSelectedContact,
  getSelectedContactDoc,

  getMessagesState,
  getMessagesError,
  getSelectedConversation,
  getConversations,

  getReportsState,
  getSelectedReportsValidChecks,
  getSelectedReportsDocs,
  getVerifyingReport,

  getTasksState,
  getSelectedTask,
  getLoadTasks,

  getTargetAggregates,
  getSelectedTargetAggregate,
  getTargetAggregatesError,
});
*/