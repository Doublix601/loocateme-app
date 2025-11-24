import { useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, useWindowDimensions, ActivityIndicator, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }] }>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: height * 0.1, alignItems: 'center', paddingBottom: Math.max(24, height * 0.2) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          >
            <Image
              source={require('../assets/appIcons/backArrow.png')}
              style={styles.backButtonImage}
            />
          </TouchableOpacity>

          <Image
            source={require('../assets/appIcons/SquareBanner.png')}
            style={[styles.logo, { width: width * 0.6, height: width * 0.6 }]}
          />
          <Text style={[styles.title, { fontSize: width * 0.08 }]}>Mot de passe oublié</Text>

          <View style={styles.formContainer}>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, backgroundColor: isDark ? '#0f1115' : '#ffffff', color: colors.textPrimary }
              ]}
              placeholder="Email"
              placeholderTextColor={isDark ? '#999' : '#666'}
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
                <Text style={styles.buttonText}>Réinitialiser le mot de passe</Text>
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    padding: 8,
  },
  backButtonImage: {
    width: 28,
    height: 28,
    tintColor: '#00c2cb',
  },
  logo: {
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#00c2cb',
    marginBottom: 20,
  },
  formContainer: {
    width: '80%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  input: {
    height: 40,
    borderColor: '#00c2cb',
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    backgroundColor: '#f8f9fa',
    color: 'grey',
  },
  button: {
    width: '70%',
    alignSelf: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00c2cb',
    borderRadius: 28,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ForgotPasswordScreen;
