import { useState, useContext } from 'react';
import { TextInput, TouchableOpacity, StyleSheet, View, ActivityIndicator, Alert, useWindowDimensions, Switch, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signup as apiSignup, setAccessToken, updateConsent, getPrivacyPolicy } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme, useStyles } from '../components/contexts/ThemeContext';
import ThemedText from '../components/ThemedText';
import AppLogo from '../components/AppLogo';

// Map backend user to frontend context shape
const mapBackendUser = (u = {}) => ({
    username: u.username || u.name || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks) ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : [],
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
});

const SignupScreen = ({ onSignup, onLogin }) => {
    const [username, setUsername] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [customName, setCustomName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [consentAccepted, setConsentAccepted] = useState(false);

    // GDPR flow states
    const [gdprModalVisible, setGdprModalVisible] = useState(false);
    const [gdprStep, setGdprStep] = useState('policy'); // 'policy' | 'prefs'
    const [policyLoading, setPolicyLoading] = useState(false);
    const [policyText, setPolicyText] = useState('');
    const [prefAnalytics, setPrefAnalytics] = useState(false);
    const [prefMarketing, setPrefMarketing] = useState(false);
    const [processing, setProcessing] = useState(false);

    const { updateUser } = useContext(UserContext);
    const { width, height } = useWindowDimensions();
    const { colors, isDark } = useTheme();
    const styles = useStyles(getStyles);

    const handleSignup = async () => {
        // Normaliser et valider le username selon les règles Instagram
        let normalized = String(username || '').trim().toLowerCase();
        const INSTAGRAM_USERNAME_REGEX = /^(?!.*\..)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
        // Note: la 1ère conjonction (?!.*\..)
        // doit vérifier « pas de deux points consécutifs » → utiliser (?!.*\.{2})
        // Corrigeons la regex:
        const IG_RE = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
        if (!IG_RE.test(normalized)) {
            setErrorMessage("Nom d'utilisateur invalide. Utilise 1–30 caractères: lettres, chiffres, points et underscores. Pas de point au début/à la fin ni deux points consécutifs.");
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage('Les mots de passe ne correspondent pas.');
            return;
        }
        if (!normalized || !email || !password) {
            setErrorMessage('Tous les champs doivent être remplis.');
            return;
        }
        // Start GDPR flow: show policy then preferences, then perform signup + consent update
        setErrorMessage('');
        try {
            setGdprStep('policy');
            setPrefAnalytics(false);
            setPrefMarketing(false);
            setGdprModalVisible(true);
            setPolicyLoading(true);
            const res = await getPrivacyPolicy();
            const text = typeof res === 'string' ? res : (res?.policy || res?.text || JSON.stringify(res, null, 2));
            setPolicyText(text);
          } catch (e) {
            setPolicyText("Impossible de charger la politique de confidentialité. Vous pourrez réessayer.");
          } finally {
            setPolicyLoading(false);
          }
    };

    const doSignupWithConsent = async () => {
        // Called from GDPR modal after user accepted policy and set preferences
        // Re-run minimal validations to be safe
        let normalized = String(username || '').trim().toLowerCase();
        const IG_RE = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
        if (!IG_RE.test(normalized) || !email || !password || password !== confirmPassword) {
            Alert.alert("Erreur", "Vérifiez les informations saisies.");
            return;
        }
        try {
            setProcessing(true);
            const res = await apiSignup({ email, password, username: normalized, firstName, lastName, customName });
            if (res?.accessToken) setAccessToken(res.accessToken);
            // Persist consent with chosen preferences
            let updatedUser = res?.user;
            try {
                const consentRes = await updateConsent({ accepted: true, version: 'v1', analytics: prefAnalytics, marketing: prefMarketing });
                if (consentRes?.user) updatedUser = consentRes.user;
            } catch (e) {
                console.warn('Consent update failed', e?.message || e);
            }
            if (updatedUser && updateUser) {
                try {
                    const mapped = mapBackendUser(updatedUser);
                    updateUser(mapped);
                } catch (mapErr) {
                    console.error('[SignupScreen] map user error', mapErr);
                }
            }
            setGdprModalVisible(false);
            onSignup && onSignup(updatedUser);
        } catch (e) {
            console.error('[SignupScreen] Signup error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert("Erreur d'inscription", e?.message || 'Veuillez réessayer');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <ThemedText style={styles.headerTitle} type={isDark ? 'primary' : 'accent'}>Créer un compte</ThemedText>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1, alignSelf: 'stretch' }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <ScrollView
                    style={{ flex: 1, alignSelf: 'stretch' }}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(24, height * 0.1), paddingHorizontal: 20, paddingTop: 20 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <AppLogo
                        width={width * 0.35}
                        height={width * 0.35}
                        style={styles.logo}
                    />

                    <View style={styles.card}>
                        <ThemedText style={styles.cardTitle}>Bienvenue !</ThemedText>
                        <ThemedText style={styles.cardSubtitle} type="secondary">Rejoignez la communauté LoocateMe</ThemedText>

                        <TextInput
                            style={styles.input}
                            placeholder="Nom d'utilisateur"
                            placeholderTextColor={colors.placeholder}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            returnKeyType="next"
                        />

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Prénom"
                                placeholderTextColor={colors.placeholder}
                                value={firstName}
                                onChangeText={setFirstName}
                                returnKeyType="next"
                            />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Nom"
                                placeholderTextColor={colors.placeholder}
                                value={lastName}
                                onChangeText={setLastName}
                                returnKeyType="next"
                            />
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="Nom personnalisé (optionnel)"
                            placeholderTextColor={colors.placeholder}
                            value={customName}
                            onChangeText={setCustomName}
                            returnKeyType="next"
                        />

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
                            secureTextEntry={true}
                            value={password}
                            onChangeText={setPassword}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Confirmer le mot de passe"
                            placeholderTextColor={colors.placeholder}
                            secureTextEntry={true}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            returnKeyType="done"
                        />

                        {errorMessage ? <ThemedText style={styles.errorText} type="danger">{errorMessage}</ThemedText> : null}

                        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <ThemedText style={styles.buttonText} type="white">S'inscrire</ThemedText>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.link} onPress={onLogin}>
                            <ThemedText style={styles.linkText} type={isDark ? 'white' : 'secondary'}>Déjà un compte ? <ThemedText style={{ color: colors.accent, fontWeight: 'bold' }}>Se connecter</ThemedText></ThemedText>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* GDPR Modal: Policy -> Preferences -> Signup */}
            <Modal visible={gdprModalVisible} animationType="slide" onRequestClose={() => setGdprModalVisible(false)}>
                <SafeAreaView style={styles.gdprContainer}>
                    <View style={styles.gdprHeader}>
                        <ThemedText style={styles.gdprTitle}>Confidentialité & RGPD</ThemedText>
                    </View>
                    {gdprStep === 'policy' ? (
                        <View style={{ flex: 1, marginTop: 10 }}>
                            {policyLoading ? (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.accent} />
                                </View>
                            ) : (
                                <ScrollView contentContainerStyle={[styles.gdprContent, { paddingHorizontal: 20 }]}>
                                    <View style={styles.gdprPolicyCard}>
                                        <ThemedText style={styles.gdprPolicyText}>{policyText}</ThemedText>
                                    </View>
                                </ScrollView>
                            )}
                            <View style={styles.gdprActions}>
                                <TouchableOpacity style={[styles.gdprButton, styles.gdprDecline]} onPress={() => { setGdprModalVisible(false); }}>
                                    <ThemedText style={styles.gdprButtonText} type="primary">Refuser</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.gdprButton, styles.gdprAccept]} onPress={() => { setConsentAccepted(true); setGdprStep('prefs'); }}>
                                    <ThemedText style={styles.gdprButtonText} type="white">Accepter</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={{ flex: 1, marginTop: 20 }}>
                            <View style={[styles.gdprContent, { paddingHorizontal: 20 }]}>
                                <View style={styles.gdprPrefsCard}>
                                    <View style={styles.gdprToggleRow}>
                                        <ThemedText style={styles.gdprLabel}>Partage analytics</ThemedText>
                                        <Switch value={prefAnalytics} onValueChange={setPrefAnalytics} trackColor={{ false: '#ccc', true: colors.accent }} thumbColor={prefAnalytics ? colors.accent : '#f4f3f4'} />
                                    </View>
                                    <View style={[styles.gdprToggleRow, { borderBottomWidth: 0 }]}>
                                        <ThemedText style={styles.gdprLabel}>Communication marketing</ThemedText>
                                        <Switch value={prefMarketing} onValueChange={setPrefMarketing} trackColor={{ false: '#ccc', true: colors.accent }} thumbColor={prefMarketing ? colors.accent : '#f4f3f4'} />
                                    </View>
                                </View>
                            </View>
                            <View style={styles.gdprActions}>
                                <TouchableOpacity style={[styles.gdprButton, styles.gdprAccept, { width: '100%' }]} onPress={doSignupWithConsent} disabled={processing}>
                                    <ThemedText style={styles.gdprButtonText} type="white">{processing ? "Création..." : "Valider et créer mon compte"}</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </SafeAreaView>
            </Modal>
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
        marginBottom: 10,
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
        backgroundColor: colors.accent,
        paddingVertical: 16,
        borderRadius: 15,
        alignItems: 'center',
        marginTop: 20,
        width: '100%',
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
    link: {
        marginTop: 20,
        alignItems: 'center',
    },
    linkText: {
        textAlign: 'center',
    },
    errorText: {
        textAlign: 'center',
        marginTop: 15,
        fontSize: 14,
        fontWeight: '600',
    },
    gdprContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    gdprHeader: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        paddingBottom: 20,
        paddingTop: Platform.OS === 'ios' ? 10 : 40,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    gdprTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    gdprContent: {
        paddingVertical: 20,
    },
    gdprPolicyCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
    },
    gdprPolicyText: {
        fontSize: 14,
        lineHeight: 22,
    },
    gdprPrefsCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 10,
    },
    gdprActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 15,
        gap: 10,
        paddingHorizontal: 20,
        paddingBottom: 30,
    },
    gdprButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 15,
        alignItems: 'center',
        marginHorizontal: 8,
    },
    gdprDecline: {
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        backgroundColor: colors.surface,
    },
    gdprAccept: {
        backgroundColor: colors.accent,
    },
    gdprButtonText: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    gdprToggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    gdprLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
});

export default SignupScreen;
