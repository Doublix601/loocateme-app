import { useContext, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    StyleSheet,
    Image,
    ScrollView,
    Dimensions,
    Alert,
    Platform,
    Pressable,
    Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import DateTimePicker from '@react-native-community/datetimepicker';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import { UserContext } from '../components/contexts/UserContext';
import { updateProfile as apiUpdateProfile, getMyUser, updateDemographics as apiUpdateDemographics } from '../components/ApiRequest';
import { isAtLeast18 } from '../utils/age';
import { useTheme } from '../components/contexts/ThemeContext';
import { useLocale } from '../components/contexts/LocalizationContext';
import { useVibe } from '../components/contexts/VibeContext';

const { width, height } = Dimensions.get('window');

const GENDER_OPTIONS = [
    { key: 'male', label: 'Garçon' },
    { key: 'female', label: 'Fille' },
    { key: 'prefer_not_to_say', label: 'Ne souhaite pas répondre' },
];

const formatBirthdate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('fr-FR');
};

const FIELDS = [
    { type: 'firstName', icon: '🙋', label: 'Prénom' },
    { type: 'lastName', icon: '👤', label: 'Nom' },
    { type: 'customName', icon: '✨', label: 'Nom personnalisé' },
    { type: 'birthdate', icon: '🎂', label: 'Date de naissance' },
    { type: 'gender', icon: '🚻', label: 'Sexe' },
];

const EditProfileScreen = () => {
    const navigation = useNavigation();
    const { colors, isDark } = useTheme();
    const { isMoon } = useVibe();
    const { locale } = useLocale();
    const insets = useSafeAreaInsets();
    const { user, updateUser } = useContext(UserContext);

    const skyFillStyle = {
        position: 'absolute',
        left: 0,
        right: 0,
        top: -insets.top,
        bottom: -insets.bottom,
    };

    const [modalVisible, setModalVisible] = useState(false);
    const [editType, setEditType] = useState('');
    const [newValue, setNewValue] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e?.endCoordinates?.height || 0));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const textPrimaryStyle = { color: isDark ? '#fff' : colors.textPrimary };
    const textSecondaryStyle = { color: isDark ? 'rgba(255,255,255,0.55)' : colors.textSecondary };

    const displayValue = (type) => {
        if (type === 'birthdate') return formatBirthdate(user?.birthdate);
        if (type === 'gender') return GENDER_OPTIONS.find((o) => o.key === user?.gender)?.label;
        return user?.[type];
    };

    const refreshMyProfile = async () => {
        try {
            const res = await getMyUser();
            const me = res?.user;
            if (!me || !updateUser) return;
            updateUser({
                ...user,
                firstName: typeof me.firstName === 'string' ? me.firstName : (user?.firstName || ''),
                lastName: typeof me.lastName === 'string' ? me.lastName : (user?.lastName || ''),
                customName: typeof me.customName === 'string' ? me.customName : (user?.customName || ''),
                birthdate: me.birthdate || user?.birthdate || null,
                gender: me.gender || user?.gender || '',
                privacyPreferences: me.privacyPreferences || user?.privacyPreferences || { analytics: false, marketing: false },
            });
        } catch (_) {}
    };

    const handleEdit = (type) => {
        setEditType(type);
        if (type === 'birthdate') {
            const d = user.birthdate ? new Date(user.birthdate) : new Date(2000, 0, 1);
            setNewValue(isNaN(d.getTime()) ? new Date(2000, 0, 1) : d);
        } else {
            setNewValue(user[type]);
        }
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setShowDatePicker(false);
    };

    const handleSave = async () => {
        try {
            const raw = String(newValue ?? '');
            if (editType === 'firstName') {
                let normalized = raw.trim();
                if (normalized) {
                    const lower = normalized.toLocaleLowerCase(locale);
                    normalized = lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
                }
                const NAME_RE = /^(\p{Lu}[\p{L}\p{M}' -]*)$/u;
                if (normalized && !NAME_RE.test(normalized)) {
                    Alert.alert('Prénom invalide', "Le prénom doit commencer par une majuscule et peut contenir des lettres (accents autorisés), espaces, apostrophes ou tirets.");
                    return;
                }
                const candidateFirst = normalized;
                const candidateLast = (user.lastName || '').trim();
                const candidateCustom = (user.customName || '').trim();
                const hasCustom = candidateCustom.length > 0;
                const hasFirst = candidateFirst.length > 0;
                const hasLast = candidateLast.length > 0;
                if (!hasCustom && !(hasFirst && hasLast)) {
                    Alert.alert('Identité incomplète', 'Renseigne un Nom personnalisé OU un Prénom ET un Nom.');
                    return;
                }
                const res = await apiUpdateProfile({ firstName: candidateFirst });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    firstName: updated.firstName ?? candidateFirst,
                    lastName: updated.lastName ?? user.lastName,
                    customName: updated.customName ?? user.customName,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'lastName') {
                let normalized = raw.trim();
                if (normalized) {
                    const lower = normalized.toLocaleLowerCase(locale);
                    normalized = lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
                }
                const NAME_RE = /^(\p{Lu}[\p{L}\p{M}' -]*)$/u;
                if (normalized && !NAME_RE.test(normalized)) {
                    Alert.alert('Nom invalide', "Le nom doit commencer par une majuscule et peut contenir des lettres (accents autorisés), espaces, apostrophes ou tirets.");
                    return;
                }
                const candidateFirst = (user.firstName || '').trim();
                const candidateLast = normalized;
                const candidateCustom = (user.customName || '').trim();
                const hasCustom = candidateCustom.length > 0;
                const hasFirst = candidateFirst.length > 0;
                const hasLast = candidateLast.length > 0;
                if (!hasCustom && !(hasFirst && hasLast)) {
                    Alert.alert('Identité incomplète', 'Renseigne un Nom personnalisé OU un Prénom ET un Nom.');
                    return;
                }
                const res = await apiUpdateProfile({ lastName: candidateLast });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    firstName: updated.firstName ?? user.firstName,
                    lastName: updated.lastName ?? candidateLast,
                    customName: updated.customName ?? user.customName,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'customName') {
                const normalized = raw.trim();
                const hasFirst = (user.firstName || '').trim().length > 0;
                const hasLast = (user.lastName || '').trim().length > 0;
                if (!normalized && (!hasFirst || !hasLast)) {
                    Alert.alert('Nom personnalisé requis', 'Impossible de supprimer le nom personnalisé tant que le prénom ou le nom est vide.');
                    return;
                }
                const res = await apiUpdateProfile({ customName: normalized });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    customName: updated.customName ?? normalized,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'birthdate') {
                const selectedDate = newValue instanceof Date ? newValue : new Date(newValue);
                if (isNaN(selectedDate.getTime())) {
                    Alert.alert('Date invalide', 'Merci de sélectionner une date de naissance valide.');
                    return;
                }
                if (!isAtLeast18(selectedDate)) {
                    Alert.alert('Âge minimum requis', 'Vous devez avoir au moins 18 ans.');
                    return;
                }
                const isoDate = selectedDate.toISOString().slice(0, 10);
                const res = await apiUpdateDemographics({ birthdate: isoDate, gender: user.gender || undefined });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    birthdate: updated.birthdate ?? isoDate,
                    privacyPreferences: updated.privacyPreferences ?? user.privacyPreferences,
                });
                await refreshMyProfile();
            } else if (editType === 'gender') {
                const res = await apiUpdateDemographics({ birthdate: user.birthdate || undefined, gender: newValue || undefined });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    gender: updated.gender ?? newValue,
                    privacyPreferences: updated.privacyPreferences ?? user.privacyPreferences,
                });
                await refreshMyProfile();
            }
        } catch (e) {
            Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le profil');
            return;
        }
        closeModal();
    };

    const activeField = FIELDS.find((f) => f.type === editType);

    return (
        <View style={{ flex: 1 }}>
            {isMoon ? (
                <NightSkyBackground style={skyFillStyle} />
            ) : (
                <DaySkyBackground style={skyFillStyle} />
            )}

            <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                <View style={styles.topBar}>
                    <TouchableOpacity
                        style={[styles.backButton, { backgroundColor: isDark ? 'rgba(0,194,203,0.18)' : 'rgba(0,194,203,0.12)' }]}
                        onPress={() => navigation.goBack()}
                        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                        accessibilityLabel="Retour"
                    >
                        <Image
                            source={require('../assets/appIcons/backArrow.png')}
                            style={styles.backIcon}
                        />
                    </TouchableOpacity>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.title}>Modifier mon profil</Text>
                    <Text style={[styles.subtitle, textSecondaryStyle]}>
                        Appuie longuement sur un champ pour le modifier
                    </Text>

                    <View style={[styles.card, { backgroundColor: colors.surface }]}>
                        {FIELDS.map((field, idx) => {
                            const value = displayValue(field.type);
                            const isEmpty = !value;
                            return (
                                <TouchableOpacity
                                    key={field.type}
                                    style={[
                                        styles.row,
                                        idx < FIELDS.length - 1 && [styles.rowDivider, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }],
                                    ]}
                                    onPress={() => handleEdit(field.type)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.rowIcon, { backgroundColor: isDark ? 'rgba(0,194,203,0.15)' : 'rgba(0,194,203,0.1)' }]}>
                                        <Text style={styles.rowIconText}>{field.icon}</Text>
                                    </View>
                                    <View style={styles.rowTextContainer}>
                                        <Text style={[styles.rowLabel, textSecondaryStyle]}>{field.label}</Text>
                                        <Text
                                            style={[
                                                styles.rowValue,
                                                isEmpty ? textSecondaryStyle : textPrimaryStyle,
                                                isEmpty && styles.rowValueEmpty,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {value || 'Non renseigné'}
                                        </Text>
                                    </View>
                                    <Text style={styles.rowChevron}>✏️</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </SafeAreaView>

            <Modal visible={modalVisible} transparent={true} animationType="fade">
                <View style={styles.modalContainer}>
                    <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
                    <View
                        style={[styles.modalKeyboardView, { height: height - keyboardHeight }]}
                        pointerEvents="box-none"
                    >
                    <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                        <View style={[styles.modalIcon, { backgroundColor: isDark ? 'rgba(0,194,203,0.15)' : 'rgba(0,194,203,0.1)' }]}>
                            <Text style={styles.modalIconText}>{activeField?.icon}</Text>
                        </View>
                        <Text style={[styles.modalTitle, textPrimaryStyle]}>
                            {activeField ? `Modifier ${activeField.label.toLowerCase()}` : 'Modifier'}
                        </Text>
                        {editType === 'birthdate' ? (
                            Platform.OS === 'ios' ? (
                                <DateTimePicker
                                    value={newValue instanceof Date ? newValue : new Date(2000, 0, 1)}
                                    mode="date"
                                    display="spinner"
                                    maximumDate={new Date()}
                                    onChange={(event, selectedDate) => {
                                        if (event.type !== 'dismissed' && selectedDate) setNewValue(selectedDate);
                                    }}
                                />
                            ) : (
                                <>
                                    <TouchableOpacity
                                        onPress={() => setShowDatePicker(true)}
                                        style={[styles.modalInput, { borderColor: colors.border, backgroundColor: isDark ? '#0f1115' : '#f7f9fa', justifyContent: 'center' }]}
                                    >
                                        <Text style={{ color: colors.textPrimary }}>
                                            {newValue instanceof Date ? newValue.toLocaleDateString('fr-FR') : 'Sélectionner une date'}
                                        </Text>
                                    </TouchableOpacity>
                                    {showDatePicker && (
                                        <DateTimePicker
                                            value={newValue instanceof Date ? newValue : new Date(2000, 0, 1)}
                                            mode="date"
                                            display="default"
                                            maximumDate={new Date()}
                                            onChange={(event, selectedDate) => {
                                                setShowDatePicker(false);
                                                if (event.type !== 'dismissed' && selectedDate) setNewValue(selectedDate);
                                            }}
                                        />
                                    )}
                                </>
                            )
                        ) : editType === 'gender' ? (
                            <View style={styles.genderPillRow}>
                                {GENDER_OPTIONS.map((opt) => (
                                    <TouchableOpacity
                                        key={opt.key}
                                        onPress={() => setNewValue(newValue === opt.key ? '' : opt.key)}
                                        style={[
                                            styles.genderPill,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
                                            newValue === opt.key && styles.genderPillActive,
                                        ]}
                                    >
                                        <Text style={newValue === opt.key ? styles.genderPillTextActive : [styles.genderPillText, textSecondaryStyle]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <TextInput
                                value={newValue}
                                onChangeText={setNewValue}
                                autoFocus
                                placeholder={
                                    editType === 'firstName' ? 'Votre prénom' :
                                    editType === 'lastName' ? 'Votre nom' :
                                    editType === 'customName' ? 'Votre nom personnalisé' :
                                    'Votre texte'
                                }
                                placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'}
                                style={[
                                    styles.modalInput,
                                    { borderColor: colors.border, color: colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#f7f9fa' },
                                ]}
                            />
                        )}
                        <View style={styles.modalButtonRow}>
                            <TouchableOpacity onPress={closeModal} style={[styles.modalButton, styles.modalButtonGhost, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]}>
                                <Text style={[styles.modalButtonGhostText, textSecondaryStyle]}>Annuler</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSave} style={[styles.modalButton, styles.modalButtonPrimary]}>
                                <Text style={styles.modalButtonPrimaryText}>Enregistrer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 6,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backIcon: {
        width: 22,
        height: 22,
        tintColor: '#00c2cb',
    },
    content: {
        paddingHorizontal: width * 0.06,
        paddingTop: height * 0.015,
        paddingBottom: height * 0.06,
    },
    title: {
        fontSize: Math.min(width * 0.075, 30),
        fontWeight: 'bold',
        color: '#00c2cb',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 6,
        marginBottom: height * 0.03,
    },
    card: {
        width: '100%',
        borderRadius: 22,
        paddingHorizontal: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 10,
    },
    rowDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowIcon: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    rowIconText: {
        fontSize: 18,
    },
    rowTextContainer: {
        flex: 1,
    },
    rowLabel: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginBottom: 2,
    },
    rowValue: {
        fontSize: 16,
        fontWeight: '600',
    },
    rowValueEmpty: {
        fontWeight: '400',
        fontStyle: 'italic',
    },
    rowChevron: {
        fontSize: 14,
        opacity: 0.4,
        marginLeft: 8,
    },
    modalContainer: {
        flex: 1,
    },
    modalKeyboardView: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: width * 0.06,
    },
    modalCard: {
        width: '100%',
        maxWidth: 460,
        borderRadius: 24,
        padding: width * 0.06,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 6,
    },
    modalIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    modalIconText: {
        fontSize: 22,
    },
    modalTitle: {
        fontSize: Math.min(width * 0.05, 20),
        fontWeight: 'bold',
        marginBottom: height * 0.02,
        textAlign: 'center',
    },
    modalInput: {
        width: '100%',
        height: height * 0.06,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: width * 0.04,
        marginBottom: height * 0.015,
        fontSize: 15,
    },
    genderPillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginBottom: height * 0.02,
    },
    genderPill: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
    },
    genderPillActive: {
        backgroundColor: '#00c2cb',
        borderColor: '#00c2cb',
    },
    genderPillText: {
        fontSize: 13,
    },
    genderPillTextActive: {
        fontSize: 13,
        color: '#fff',
        fontWeight: '600',
    },
    modalButtonRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 10,
        marginTop: 6,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonGhost: {
        borderWidth: 1,
    },
    modalButtonGhostText: {
        fontSize: 15,
        fontWeight: '600',
    },
    modalButtonPrimary: {
        backgroundColor: '#00c2cb',
    },
    modalButtonPrimaryText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
});

export default EditProfileScreen;
