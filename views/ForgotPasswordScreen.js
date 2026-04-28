import { useState } from 'react';
import { TextInput, TouchableOpacity, StyleSheet, Alert, useWindowDimensions, ActivityIndicator, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useStyles } from '../components/contexts/ThemeContext';
import ThemedText from '../components/ThemedText';
import AppLogo from '../components/AppLogo';
import { forgotPassword } from '../components/ApiRequest';

const ForgotPasswordScreen = ({ onResetPassword, onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const styles = useStyles(getStyles);

  const handleReset = async () => {
    try {
      setLoading(true);
      await forgotPassword(email);
      Alert.alert('Email envoyé', 'Si un compte existe, un email a été envoyé.');
      onResetPassword && onResetPassword();
    } catch (e) {
      console.error('[ForgotPasswordScreen] Forgot password error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Erreur', e?.message || 'Veuillez réessayer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButtonCircular}
          onPress={onBack}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle} type={isDark ? 'primary' : 'accent'}>Mot de passe oublié</ThemedText>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, alignSelf: 'stretch' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          style={{ flex: 1, alignSelf: 'stretch' }}
          contentContainerStyle={{ paddingTop: height * 0.05, alignItems: 'center', paddingBottom: Math.max(24, height * 0.1), paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppLogo
            width={width * 0.35}
            height={width * 0.35}
            style={styles.logo}
          />

          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>Réinitialisation</ThemedText>
            <ThemedText style={styles.instructionText} type="secondary">
                Saisissez votre adresse email pour recevoir un lien de réinitialisation.
            </ThemedText>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              returnKeyType="done"
            />

            <TouchableOpacity onPress={handleReset} style={styles.button} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText} type="white">Envoyer le lien</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const getStyles = ({ colors, isDark }) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginRight: 40,
  },
  backButtonCircular: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,194,203,0.1)',
  },
  backIcon: {
    width: 20,
    height: 20,
    tintColor: colors.accent,
  },
  logo: {
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 25,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    width: '100%',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  instructionText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 25,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 15,
    marginBottom: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  },
  button: {
    width: '100%',
    alignSelf: 'center',
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 15,
    marginTop: 20,
    elevation: 3,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ForgotPasswordScreen;
