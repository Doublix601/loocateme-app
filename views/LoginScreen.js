import { useState, useContext } from 'react';
import { TextInput, TouchableOpacity, StyleSheet, View, useWindowDimensions, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login as apiLogin, setAccessToken } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme, useStyles } from '../components/contexts/ThemeContext';
import ThemedText from '../components/ThemedText';
import AppLogo from '../components/AppLogo';
import SocialAuthButton from '../components/SocialAuthButton';

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
    const styles = useStyles(getStyles);

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
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <ThemedText style={styles.headerTitle} type={isDark ? 'primary' : 'accent'}>Connexion</ThemedText>
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
                    <AppLogo
                        width={width * 0.4}
                        height={width * 0.4}
                        style={styles.logo}
                    />

                    <View style={styles.card}>
                        <ThemedText style={styles.cardTitle}>Bon retour parmi nous !</ThemedText>
                        <ThemedText style={styles.cardSubtitle} type="secondary">Connectez-vous pour continuer</ThemedText>

                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor={colors.placeholder}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Mot de passe"
                            placeholderTextColor={colors.placeholder}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            returnKeyType="done"
                        />

                        <TouchableOpacity onPress={handleLoginPress} style={styles.button} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <ThemedText style={styles.buttonText} type="white">Se connecter</ThemedText>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={onForgotPassword} style={{ marginTop: 20, alignSelf: 'center' }}>
                            <ThemedText style={[styles.linkText, { fontSize: width * 0.035 }]} type={isDark ? 'white' : 'accent'}>Mot de passe oublié ?</ThemedText>
                        </TouchableOpacity>

                        <View style={styles.dividerContainer}>
                            <View style={styles.divider} />
                            <ThemedText style={styles.dividerText} type="secondary">OU</ThemedText>
                            <View style={styles.divider} />
                        </View>

                        <SocialAuthButton
                            type="google"
                            onPress={() => console.log('Google login')}
                            loading={false}
                        />
                        {Platform.OS === 'ios' && (
                            <SocialAuthButton
                                type="apple"
                                onPress={() => console.log('Apple login')}
                                loading={false}
                            />
                        )}
                    </View>

                    <TouchableOpacity onPress={onSignup} style={{ marginTop: 30, alignSelf: 'center' }}>
                        <ThemedText style={[styles.linkText, { fontSize: width * 0.04 }]} type={isDark ? 'white' : 'secondary'}>Pas encore de compte ? <ThemedText style={{ color: colors.accent, fontWeight: 'bold' }}>Créer un compte</ThemedText></ThemedText>
                    </TouchableOpacity>
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
        justifyContent: 'center',
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
        backgroundColor: colors.inputBackground,
        color: colors.textPrimary,
        borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.accent,
        borderRadius: 15,
        marginTop: 10,
        elevation: 3,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    linkText: {
        textAlign: 'center',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    dividerText: {
        marginHorizontal: 10,
        fontSize: 12,
        fontWeight: 'bold',
    },
});

export default LoginScreen;
