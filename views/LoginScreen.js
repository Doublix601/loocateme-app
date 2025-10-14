import { useState, useContext } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, Image, View, useWindowDimensions, ActivityIndicator, Alert } from 'react-native';
import { login as apiLogin, setAccessToken } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';

// Map backend user to frontend shape used by context/UI
const mapBackendUser = (u = {}) => ({
    username: u.name || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks) ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : [],
    isVisible: u.isVisible !== false,
});

const LoginScreen = ({ onLogin, onForgotPassword, onSignup }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const { width, height } = useWindowDimensions(); // Récupère les dimensions de l'écran
    const { updateUser } = useContext(UserContext);

    const handleLoginPress = async () => {
        try {
            setLoading(true);
            const res = await apiLogin({ email, password });
            if (res?.accessToken) setAccessToken(res.accessToken);
            if (res?.user && updateUser) {
                try {
                    const mapped = mapBackendUser(res.user);
                    updateUser(mapped);
                } catch (mapErr) {
                    console.error('[LoginScreen] map user error', mapErr);
                }
            }
            onLogin && onLogin(res?.user);
        } catch (e) {
            console.error('[LoginScreen] Login error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert('Authentification échouée', 'Impossible de vous connecter. Vérifiez vos identifiants et réessayez.');
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
