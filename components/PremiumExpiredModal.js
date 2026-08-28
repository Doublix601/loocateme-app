// Modale informative affichée une seule fois quand l abonnement Premium est
// repassé en Free (fin d essai gratuit ou fin d abonnement payé). But : prévenir
// clairement l utilisateur du changement de formule sans le piéger — il peut
// fermer la modale et continuer à utiliser l app en Free, ou rouvrir le paywall.
import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "./contexts/ThemeContext";
import CloseButton from "./CloseButton";

export default function PremiumExpiredModal({ visible, onClose, onSeePremium }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <CloseButton onPress={onClose} style={styles.closeBtn} />

          <Text style={styles.emoji}>👑</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t("premiumExpiredModal.title")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t("premiumExpiredModal.body")}
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            onPress={onSeePremium}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryTxt}>{t("premiumExpiredModal.cta")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
            <Text style={[styles.secondaryTxt, { color: colors.textSecondary }]}>
              {t("premiumExpiredModal.dismiss")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: { width: "100%", borderRadius: 16, padding: 24, alignItems: "center" },
  closeBtn: { position: "absolute", top: 12, right: 12 },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 22 },
  primaryBtn: { width: "100%", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondaryBtn: { marginTop: 12, paddingVertical: 6 },
  secondaryTxt: { fontSize: 13, fontWeight: "600" },
});
