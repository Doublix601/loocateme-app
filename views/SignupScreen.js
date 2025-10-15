import { useState, useContext } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, View, ActivityIndicator, Alert, Image, useWindowDimensions } from 'react-native';
import { signup as apiSignup, setAccessToken, updateConsent, getPrivacyPolicy } from '../components/ApiRequest';
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
    const [consentAccepted, setConsentAccepted] = useState(false);

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
        if (!consentAccepted) {
            setErrorMessage('Vous devez accepter la politique de confidentialité (RGPD) pour créer un compte.');
            return;
        }
        setErrorMessage('');
        try {
            setLoading(true);
            const res = await apiSignup({ email, password, name: username });
            if (res?.accessToken) setAccessToken(res.accessToken);
            // Immediately record GDPR consent on backend
            try { await updateConsent({ accepted: true, version: 'v1', analytics: false, marketing: false }); } catch (e) { console.warn('Consent update failed', e?.message || e); }
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
                    placeholderTextColor="#666"
                    value={username}
                    onChangeText={setUsername}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#666"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Mot de passe"
                    placeholderTextColor="#666"
                    secureTextEntry={true}
                    value={password}
                    onChangeText={setPassword}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Confirmer le mot de passe"
                    placeholderTextColor="#666"
                    secureTextEntry={true}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                />

                <View style={styles.consentRow}>
                    <TouchableOpacity onPress={() => setConsentAccepted(!consentAccepted)} style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>
                        {consentAccepted ? <Text style={styles.checkboxTick}>✓</Text> : null}
                    </TouchableOpacity>
                    <Text style={styles.consentText}>
                        J'accepte la politique de confidentialité et le traitement de mes données selon le RGPD.
                    </Text>
                </View>

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
    consentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 8,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderWidth: 1,
        borderColor: '#00c2cb',
        borderRadius: 4,
        marginRight: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    checkboxChecked: {
        backgroundColor: '#00c2cb',
        borderColor: '#00a0a8',
    },
    checkboxTick: {
        color: '#fff',
        fontWeight: 'bold',
    },
    consentText: {
        flex: 1,
        color: '#444',
        fontSize: 12,
    },
});

export default SignupScreen;
