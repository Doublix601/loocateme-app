import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, useWindowDimensions, ActivityIndicator, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/contexts/ThemeContext';
import { forgotPassword } from '../components/ApiRequest';

const ForgotPasswordScreen = ({ onResetPassword, onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useTheme();

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }] }>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: Platform.OS === 'android' ? 40 : 10, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={onBack}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.text : '#00c2cb' }]}>Mot de passe oublié</Text>
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
          <Image
            source={require('../assets/appIcons/SquareBanner.png')}
            style={[styles.logo, { width: width * 0.35, height: width * 0.35 }]}
          />

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Réinitialisation</Text>
            <Text style={[styles.instructionText, { color: colors.textSecondary, marginBottom: 25 }]}>
                Saisissez votre adresse email pour recevoir un lien de réinitialisation.
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  backgroundColor: isDark ? colors.surfaceAlt : '#f8f9fa',
                  color: colors.text
                }
              ]}
              placeholder="Email"
              placeholderTextColor={isDark ? '#888' : '#999'}
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
                <Text style={styles.buttonText}>Envoyer le lien</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  },
  backIcon: {
    width: 20,
    height: 20,
  },
  logo: {
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 20,
  },
  card: {
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
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 15,
    marginBottom: 12,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  button: {
    width: '100%',
    alignSelf: 'center',
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00c2cb',
    borderRadius: 15,
    marginTop: 20,
    elevation: 3,
    shadowColor: '#00c2cb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ForgotPasswordScreen;
