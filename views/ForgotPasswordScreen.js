import { useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, useWindowDimensions, ActivityIndicator, View } from 'react-native';
import { forgotPassword } from '../components/ApiRequest';

const ForgotPasswordScreen = ({ onResetPassword, onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { width, height } = useWindowDimensions();

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
    <SafeAreaView style={[styles.container, { paddingTop: height * 0.1 }] }>
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
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TouchableOpacity onPress={handleReset} style={styles.button} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Réinitialiser le mot de passe</Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00c2cb',
    borderRadius: 25,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ForgotPasswordScreen;
