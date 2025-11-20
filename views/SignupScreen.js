import { useState, useContext } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, StyleSheet, View, ActivityIndicator, Alert, Image, useWindowDimensions, Switch, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { signup as apiSignup, setAccessToken, updateConsent, getPrivacyPolicy } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';

// Map backend user to frontend context shape
const mapBackendUser = (u = {}) => ({
    username: u.username || u.name || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks) ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : [],
    isVisible: u.isVisible !== false,
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
        <SafeAreaView style={[styles.container, { paddingTop: height * 0.08 }]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: Math.max(24, height * 0.2) }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Image
                        source={require('../assets/appIcons/SquareBanner.png')}
                        style={[styles.logo, { width: width * 0.6, height: width * 0.6 }]}
                    />
                    <Text style={[styles.title, { fontSize: width * 0.08 }]}>Inscription</Text>

                    <View style={styles.formContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="Prénom (optionnel)"
                            placeholderTextColor="#666"
                            value={firstName}
                            onChangeText={setFirstName}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Nom (optionnel)"
                            placeholderTextColor="#666"
                            value={lastName}
                            onChangeText={setLastName}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Nom d'utilisateur"
                            placeholderTextColor="#666"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Nom personnalisé (optionnel)"
                            placeholderTextColor="#666"
                            value={customName}
                            onChangeText={setCustomName}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor="#666"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Mot de passe"
                            placeholderTextColor="#666"
                            secureTextEntry={true}
                            value={password}
                            onChangeText={setPassword}
                            returnKeyType="next"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Confirmer le mot de passe"
                            placeholderTextColor="#666"
                            secureTextEntry={true}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            returnKeyType="done"
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
                </ScrollView>
            </KeyboardAvoidingView>

            {/* GDPR Modal: Policy -> Preferences -> Signup */}
            <Modal visible={gdprModalVisible} animationType="slide" onRequestClose={() => setGdprModalVisible(false)}>
                <SafeAreaView style={styles.gdprContainer}>
                    <View style={styles.gdprHeader}>
                        <Text style={styles.gdprTitle}>Confidentialité & RGPD</Text>
                    </View>
                    {gdprStep === 'policy' ? (
                        <View style={{ flex: 1 }}>
                            {policyLoading ? (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <ActivityIndicator size="large" color="#00c2cb" />
                                </View>
                            ) : (
                                <ScrollView contentContainerStyle={styles.gdprContent}>
                                    <Text style={styles.gdprPolicyText}>{policyText}</Text>
                                </ScrollView>
                            )}
                            <View style={styles.gdprActions}>
                                <TouchableOpacity style={[styles.gdprButton, styles.gdprDecline]} onPress={() => { setGdprModalVisible(false); }}>
                                    <Text style={styles.gdprButtonText}>Refuser</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.gdprButton, styles.gdprAccept]} onPress={() => { setConsentAccepted(true); setGdprStep('prefs'); }}>
                                    <Text style={styles.gdprButtonText}>Accepter</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={{ flex: 1 }}>
                            <View style={styles.gdprContent}>
                                <View style={styles.gdprToggleRow}>
                                    <Text style={styles.gdprLabel}>Partage analytics</Text>
                                    <Switch value={prefAnalytics} onValueChange={setPrefAnalytics} trackColor={{ false: '#ccc', true: '#00c2cb' }} thumbColor={prefAnalytics ? '#00c2cb' : '#f4f3f4'} />
                                </View>
                                <View style={styles.gdprToggleRow}>
                                    <Text style={styles.gdprLabel}>Communication marketing</Text>
                                    <Switch value={prefMarketing} onValueChange={setPrefMarketing} trackColor={{ false: '#ccc', true: '#00c2cb' }} thumbColor={prefMarketing ? '#00c2cb' : '#f4f3f4'} />
                                </View>
                            </View>
                            <View style={styles.gdprActions}>
                                <TouchableOpacity style={[styles.gdprButton, styles.gdprAccept]} onPress={doSignupWithConsent} disabled={processing}>
                                    <Text style={styles.gdprButtonText}>{processing ? "Création..." : "Valider et créer mon compte"}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </SafeAreaView>
            </Modal>
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
        width: '100%',
        maxWidth: undefined,
        alignSelf: 'center',
    },
    input: {
        height: 46,
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
        width: '100%',
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
  gdprContainer: { flex: 1, backgroundColor: '#fff' },
  gdprHeader: { padding: 16, alignItems: 'center' },
  gdprTitle: { fontSize: 20, fontWeight: '600', color: '#222' },
  gdprContent: { padding: 16 },
  gdprPolicyText: { fontSize: 14, color: '#333', lineHeight: 20 },
  gdprActions: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  gdprButton: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', marginHorizontal: 6 },
  gdprAccept: { backgroundColor: '#00c2cb' },
  gdprDecline: { backgroundColor: '#999' },
  gdprButtonText: { color: '#fff', fontWeight: '600' },
  gdprToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  gdprLabel: { fontSize: 16, color: '#333' },
});

export default SignupScreen;
