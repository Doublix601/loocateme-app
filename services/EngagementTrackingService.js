import { put, post } from '../components/ApiRequest';
import { logger } from '../utils/logger';

// Rapporte l'état courant des permissions localisation/notifications au backend,
// qui s'en sert pour détecter les comptes "à risque" de désinstallation
// (cf. loocateme_backend/src/services/churnRisk.service.js) et leur envoyer une
// relance ciblée plutôt qu'un nudge générique d'inactivité.
export async function reportPermissionStatus({ locationPermissionStatus, notificationsPermissionStatus }) {
  try {
    await put('/engagement/permissions', { locationPermissionStatus, notificationsPermissionStatus });
  } catch (e) {
    logger.log('[EngagementTrackingService] reportPermissionStatus error:', e?.message);
  }
}

// Capte la raison au moment où l'utilisateur désactive une permission clé, pendant
// qu'il est encore joignable, plutôt qu'après une désinstallation où il ne l'est
// plus (cf. ChurnSurveyModal.js).
export async function submitChurnSurvey({ reason, context }) {
  try {
    await post('/engagement/churn-survey', { reason, context });
  } catch (e) {
    logger.log('[EngagementTrackingService] submitChurnSurvey error:', e?.message);
  }
}

export default { reportPermissionStatus, submitChurnSurvey };
