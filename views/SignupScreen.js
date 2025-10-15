import { useState, useContext } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, View, ActivityIndicator, Alert, Image, useWindowDimensions } from 'react-native';
import { signup as apiSignup, setAccessToken } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';

// Map backend user to frontend context shape
const mapBackendUser = (u = {}) => ({
    username: u.name || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks) ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : [],
    isVisible: u.isVisible !== false,
});

const SignupScreen = ({ onSignup, onLogin }) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const { updateUser } = useContext(UserContext);
    const { width, height } = useWindowDimensions();

    const handleSignup = async () => {
        if (password !== confirmPassword) {
            setErrorMessage('Les mots de passe ne correspondent pas.');
            return;
        }
        if (!username || !email || !password) {
            setErrorMessage('Tous les champs doivent être remplis.');
            return;
        }
        setErrorMessage('');
        try {
            setLoading(true);
            const res = await apiSignup({ email, password, name: username });
            if (res?.accessToken) setAccessToken(res.accessToken);
            if (res?.user && updateUser) {
                try {
                    const mapped = mapBackendUser(res.user);
                    updateUser(mapped);
                } catch (mapErr) {
                    console.error('[SignupScreen] map user error', mapErr);
                }
            }
            onSignup && onSignup(res?.user);
        } catch (e) {
            console.error('[SignupScreen] Signup error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert("Erreur d'inscription", e?.message || 'Veuillez réessayer');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { paddingTop: height * 0.08 }]}>
            <Image
                source={require('../assets/appIcons/SquareBanner.png')}
                style={[styles.logo, { width: width * 0.6, height: width * 0.6 }]}
            />
            <Text style={[styles.title, { fontSize: width * 0.08 }]}>Inscription</Text>

            <View style={styles.formContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Nom d'utilisateur"
                    value={username}
                    onChangeText={setUsername}
                />
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
                    secureTextEntry={true}
                    value={password}
                    onChangeText={setPassword}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Confirmer le mot de passe"
                    secureTextEntry={true}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                />

                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

                <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>S'inscrire</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.link} onPress={onLogin}>
                    <Text style={styles.linkText}>Déjà un compte ? Se connecter</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    logo: {
        resizeMode: 'contain',
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
        color: '#00c2cb',
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
        backgroundColor: '#00c2cb',
        paddingVertical: 15,
        borderRadius: 25,
        alignItems: 'center',
        marginTop: 20,
        width: '70%',
        alignSelf: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    link: {
        marginTop: 20,
        alignItems: 'center',
    },
    linkText: {
        color: '#00c2cb',
        fontSize: 14,
        textAlign: 'center',
    },
    errorText: {
        color: 'red',
        textAlign: 'center',
        marginBottom: 10,
    },
});

export default SignupScreen;
