import { useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, Image, View, useWindowDimensions, ActivityIndicator, Alert } from 'react-native';
import { login as apiLogin, setAccessToken } from '../components/ApiRequest';

const LoginScreen = ({ onLogin, onForgotPassword, onSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { width, height } = useWindowDimensions(); // Récupère les dimensions de l'écran

  const handleLoginPress = async () => {
    try {
      setLoading(true);
      const res = await apiLogin({ email, password });
      if (res?.accessToken) setAccessToken(res.accessToken);
      onLogin && onLogin(res?.user);
    } catch (e) {
      Alert.alert('Erreur de connexion', e?.message || 'Veuillez réessayer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: height * 0.1 }]}>
      <Image
        source={require('../assets/appIcons/SquareBanner.png')}
        style={[styles.logo, { width: width * 0.6, height: width * 0.6 }]}
      />
      <Text style={[styles.title, { fontSize: width * 0.08 }]}>Connexion</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity onPress={handleLoginPress} style={styles.button} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Se connecter</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onForgotPassword}>
        <Text style={[styles.linkText, { fontSize: width * 0.04 }]}>Mot de passe oublié ?</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSignup}>
        <Text style={[styles.linkText, { fontSize: width * 0.04 }]}>Créer un compte</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start', // Contenu aligné en haut
    alignItems: 'center', // Centrage horizontal
    paddingHorizontal: 16, // Espacement horizontal
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
    marginBottom: 25,
  },
  input: {
    height: 40,
    borderColor: '#00c2cb',
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    width: '80%', // Largeur relative
    alignSelf: 'center', // Centrage horizontal
    color: 'grey'
  },
  button: {
    width: '70%', // Largeur relative
    alignSelf: 'center',
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00c2cb',
    borderRadius: 25,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  linkText: {
    color: '#00c2cb',
    textAlign: 'center',
    marginTop: 10,
  },
});

export default LoginScreen;
