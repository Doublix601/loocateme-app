import { useState, useContext } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, Image, View, useWindowDimensions, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login as apiLogin, setAccessToken } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';

// Map backend user to frontend shape used by context/UI
const mapBackendUser = (u = {}) => ({
    username: u.username || u.name || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks) ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : [],
    isPremium: !!u.isPremium,
    role: u.role || 'user',
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
});

const LoginScreen = ({ onLogin, onForgotPassword, onSignup }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const { width, height } = useWindowDimensions(); // Récupère les dimensions de l'écran
    const { updateUser } = useContext(UserContext);
    const { colors, isDark } = useTheme();

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
            if (e?.code === 'EMAIL_NOT_VERIFIED' || e?.status === 403 && (e?.response?.code === 'EMAIL_NOT_VERIFIED')) {
                Alert.alert(
                    'Email non vérifié',
                    "Votre adresse email n'a pas encore été vérifiée. Nous venons de vous renvoyer un email de confirmation. Veuillez cliquer sur le lien pour activer votre compte, puis réessayez."
                );
            } else {
                Alert.alert('Authentification échouée', 'Impossible de vous connecter. Vérifiez vos identifiants et réessayez.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: Platform.OS === 'android' ? 40 : 10 }]}>
                <Text style={[styles.headerTitle, { color: isDark ? colors.text : '#00c2cb' }]}>Connexion</Text>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1, alignSelf: 'stretch' }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <ScrollView
                    style={{ flex: 1, alignSelf: 'stretch' }}
                    contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Image
                        source={require('../assets/appIcons/SquareBanner.png')}
                        style={[styles.logo, { width: width * 0.4, height: width * 0.4 }]}
                    />

                    <View style={[styles.card, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>Bon retour parmi nous !</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Connectez-vous pour continuer</Text>

                        <TextInput
                            style={[styles.input, {
                                backgroundColor: isDark ? colors.surfaceAlt : '#f8f9fa',
                                color: colors.text,
                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                            }]}
                            placeholder="Email"
                            placeholderTextColor={isDark ? '#888' : '#999'}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: isDark ? colors.surfaceAlt : '#f8f9fa',
                                color: colors.text,
                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                            }]}
                            placeholder="Mot de passe"
                            placeholderTextColor={isDark ? '#888' : '#999'}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            returnKeyType="done"
                        />

                        <TouchableOpacity onPress={handleLoginPress} style={styles.button} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>Se connecter</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={onForgotPassword} style={{ marginTop: 20, alignSelf: 'center' }}>
                            <Text style={[styles.linkText, { fontSize: width * 0.035, color: isDark ? '#fff' : '#00c2cb', opacity: 0.8 }]}>Mot de passe oublié ?</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={onSignup} style={{ marginTop: 30, alignSelf: 'center' }}>
                        <Text style={[styles.linkText, { fontSize: width * 0.04, color: isDark ? '#fff' : colors.textSecondary }]}>Pas encore de compte ? <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Créer un compte</Text></Text>
                    </TouchableOpacity>
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
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        zIndex: 10,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        textAlign: 'center',
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
    cardSubtitle: {
        fontSize: 14,
        marginBottom: 25,
        textAlign: 'center',
        opacity: 0.7,
    },
    input: {
        height: 55,
        borderWidth: 1,
        borderRadius: 15,
        marginBottom: 15,
        paddingHorizontal: 15,
        width: '100%',
        fontSize: 16,
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#00c2cb',
        borderRadius: 15,
        marginTop: 10,
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
    },
    linkText: {
        textAlign: 'center',
    },
});

export default LoginScreen;
