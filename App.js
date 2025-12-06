import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Image, 
  StyleSheet, 
  TouchableOpacity, 
  Text, 
  SafeAreaView, 
  StatusBar, 
  Dimensions, 
  Alert,
  Animated, 
  PanResponder,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';

// --- CONFIGURATION ---
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_THRESHOLD = 120;
const CLICK_THRESHOLD = 5;

// --- UTILITAIRES ---
const shuffleArray = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
};

const formatBytes = (bytes, decimals = 1) => {
    if (!bytes || bytes === 0) return '0 Mo';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const COLORS = {
  bg: '#FFFFFF',
  textPrimary: '#1C1C1E', 
  textSecondary: '#8E8E93', 
  accentRed: '#FF3B30',    
  accentGreen: '#34C759',  
  borderColor: '#E5E5EA',
  overlayBg: 'rgba(0,0,0,0.95)'
};

const FONT_TITLE = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium';
const FONT_BODY = Platform.OS === 'ios' ? 'Arial' : 'sans-serif';

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  
  const [photos, setPhotos] = useState([]); 
  const [trash, setTrash] = useState([]);   
  const [viewMode, setViewMode] = useState('swiper'); 
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomImage, setZoomImage] = useState(null);

  // REFERENCES
  const photosRef = useRef([]);
  const indexRef = useRef(0);

  useEffect(() => {
    photosRef.current = photos;
    indexRef.current = currentIndex;
  }, [photos, currentIndex]);

  const pan = useRef(new Animated.ValueXY()).current;

  // 1. CHARGEMENT
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        loadPhotos();
      }
    })();
  }, []);
  
  // NOTE: On désactive le includeFileLength et getAssetInfoAsync pour éviter le 0 Mo bug
  const loadPhotos = async () => {
    setLoading(true);
    try {
        let assets = await MediaLibrary.getAssetsAsync({
            first: 500,
            mediaType: 'photo',
            sortBy: [MediaLibrary.SortBy.creationTime],
            // includeFileLength: true est retiré
        });

        const shuffledPhotos = shuffleArray(assets.assets);
        setPhotos(shuffledPhotos);
    } catch (e) {
        Alert.alert("Erreur", "Impossible de charger les photos.");
    }
    setLoading(false);
  };
  
  // LOGIQUE DE TAILLE (Restaurée à la base pour éviter le crash)
  const totalTrashSize = trash.reduce((acc, item) => acc + (item.fileSize || 0), 0);

  // 2. LOGIQUE SWIPE + CLIC
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (e, gestureState) => {
        if (Math.abs(gestureState.dx) < CLICK_THRESHOLD && Math.abs(gestureState.dy) < CLICK_THRESHOLD) {
            const currentItem = photosRef.current[indexRef.current];
            if (currentItem) setZoomImage(currentItem);
            resetPosition(); 
        } 
        else if (gestureState.dx > SWIPE_THRESHOLD) {
          forceSwipe('right'); 
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          forceSwipe('left'); 
        } else {
          resetPosition(); 
        }
      }
    })
  ).current;

  const forceSwipe = (direction) => {
    const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(pan, {
      toValue: { x, y: 0 }, duration: 200, useNativeDriver: false
    }).start(() => onSwipeComplete(direction));
  };

  const onSwipeComplete = (direction) => {
    const currentList = photosRef.current;
    const currentIdx = indexRef.current;
    const item = currentList[currentIdx];

    if (!item) return;

    if (direction === 'left') {
        setTrash(prev => [...prev, item]);
    }

    pan.setValue({ x: 0, y: 0 });
    setCurrentIndex(prev => prev + 1);
  };

  const resetPosition = () => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start();
  };

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH/2, 0, SCREEN_WIDTH/2], outputRange: ['-8deg', '0deg', '8deg'], extrapolate: 'clamp' });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SCREEN_WIDTH/4], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH/4, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  // 3. ACTIONS
  const restaurerPhoto = (assetId) => {
    setTrash(trash.filter(item => item.id !== assetId));
  };

  const viderLaCorbeille = async () => {
    if (trash.length === 0) return;
    if (isDeleting) return;

    Alert.alert(
      "CONFIRMATION",
      `Supprimer définitivement ${trash.length} éléments ?`,
      [
        { text: "Annuler", style: "cancel" },
        { 
          text: "SUPPRIMER", 
          style: "destructive", 
          onPress: async () => {
            setIsDeleting(true);
            try {
              await MediaLibrary.deleteAssetsAsync(trash);
              setTrash([]); 
              Alert.alert("Succès", `Nettoyage terminé !`);
            } catch (error) {
              Alert.alert("Info", "Suppression bloquée par le système.");
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  // 4. RENDU
  const renderCard = (item, isFront) => {
    if (!item) return <View style={styles.cardEmpty}><Text style={styles.emptyTitle}>FIN DE LA LISTE</Text></View>;
    
    const animatedStyle = isFront ? { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate: rotate }] } : {};
    const handlers = isFront ? panResponder.panHandlers : {};

    return (
      <Animated.View style={[styles.card, animatedStyle]} {...handlers}>
        <Image source={{ uri: item.uri }} style={styles.cardImage} resizeMode="cover" />
        
        {isFront && (
          <Animated.View style={[styles.overlayLabel, { left: 30, borderColor: COLORS.accentGreen, opacity: likeOpacity }]}>
            <Text style={[styles.overlayText, { color: COLORS.accentGreen }]}>GARDER</Text>
          </Animated.View>
        )}
        {isFront && (
          <Animated.View style={[styles.overlayLabel, { right: 30, borderColor: COLORS.accentRed, opacity: nopeOpacity }]}>
            <Text style={[styles.overlayText, { color: COLORS.accentRed }]}>JETER</Text>
          </Animated.View>
        )}

        <View style={styles.cardInfo}>
            <View style={styles.cardInfoRow}>
                {/* On affiche le count seulement pour le moment */}
                <Text style={styles.cardSize}>{formatBytes(item.width)}x{formatBytes(item.height)}</Text>
                <Text style={styles.cardDate}>{new Date(item.creationTime).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.clickHint}>Cliquer pour agrandir</Text>
        </View>
      </Animated.View>
    );
  };

  const renderSwiper = () => {
    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.textPrimary} /></View>;
    
    if (currentIndex >= photos.length) {
      return (
        <View style={styles.center}>
          <Text style={styles.titleClassy}>C'EST PROPRE.</Text>
          <TouchableOpacity style={styles.btnClassySolid} onPress={() => setViewMode('bin')}>
             <Text style={styles.btnTextSolid}>CORBEILLE ({trash.length})</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.swiperContainer}>
        {photos[currentIndex + 1] && (
          <View style={[styles.card, styles.cardNext]}>
             <Image source={{ uri: photos[currentIndex + 1].uri }} style={styles.cardImage} resizeMode="cover" />
          </View>
        )}
        {renderCard(photos[currentIndex], true)}
        
        <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>JETER</Text>
            <View style={styles.instructionSeparator} />
            <Text style={styles.instructionText}>GARDER</Text>
        </View>
      </View>
    );
  };

  const renderBin = () => (
    <View style={{flex: 1, backgroundColor: COLORS.bg}}>
        <View style={styles.binHeaderClassy}>
            <TouchableOpacity onPress={() => setViewMode('swiper')} style={styles.headerBtnBack}>
                <Text style={styles.headerBtnText}>Retour</Text>
            </TouchableOpacity>
            <View style={{alignItems: 'center'}}>
                <Text style={styles.binTitleClassy}>Corbeille ({trash.length})</Text>
                {/* La ligne de Mo est gardée ici mais ne sera pas fiable : */}
                <Text style={styles.binSubTitle}>Total : {formatBytes(totalTrashSize)}</Text>
            </View>
            <TouchableOpacity onPress={viderLaCorbeille} disabled={trash.length === 0 || isDeleting}>
                {isDeleting ? <ActivityIndicator size="small" color={COLORS.accentRed} /> : 
                <Text style={[styles.headerBtnDelete, trash.length === 0 && {color: COLORS.textSecondary}]}>Vider</Text>}
            </TouchableOpacity>
        </View>
        
        {trash.length === 0 ? (
            <View style={styles.center}>
                <Text style={styles.subTitleClassy}>Corbeille vide.</Text>
            </View>
        ) : (
            <FlatList 
                data={trash}
                keyExtractor={(item, index) => item?.id ? item.id : index.toString()}
                numColumns={3}
                contentContainerStyle={{padding: 1}}
                renderItem={({item}) => {
                    if (!item || !item.uri) return null;
                    return (
                        <TouchableOpacity style={styles.gridItem} onPress={() => restaurerPhoto(item.id)} activeOpacity={0.8}>
                            <Image source={{ uri: item.uri }} style={styles.gridImage} />
                            <View style={styles.restoreOverlayClassy}>
                                <Text style={styles.restoreTextClassy}>RESTAURER</Text>
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />
        )}
    </View>
  );

  if (hasPermission === false) {
    return <View style={styles.center}><Text style={styles.subTitleClassy}>Accès photos requis.</Text></View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      
      {viewMode === 'swiper' && (
      <View style={styles.headerClassy}>
        <Text style={styles.headerTitleClassy}>CLEANER.</Text>
        {/* CORRECTION UI : On affiche seulement le statut de la corbeille */}
        <TouchableOpacity style={styles.trashBtnClassy} onPress={() => setViewMode('bin')}>
             <Text style={styles.trashBtnTextClassy}>
                 CORBEILLE ({trash.length})
             </Text>
        </TouchableOpacity>
      </View>
      )}

      <SafeAreaView style={styles.content}>
        {viewMode === 'swiper' ? renderSwiper() : renderBin()}
      </SafeAreaView>

      <Modal visible={zoomImage !== null} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
            <TouchableOpacity style={styles.modalCloseArea} onPress={() => setZoomImage(null)} />
            
            {zoomImage && (
                <View style={styles.modalContent}>
                    <Image source={{uri: zoomImage.uri}} style={styles.modalImage} resizeMode="contain" />
                    <View style={styles.modalInfoBar}>
                        <Text style={styles.modalInfoText}>
                            {zoomImage.width}x{zoomImage.height}
                            {/* On affiche ici aussi les infos de taille si elles reviennent un jour ! */}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setZoomImage(null)}>
                        <Text style={styles.modalCloseText}>FERMER</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  content: { flex: 1 },

  headerClassy: { 
      paddingTop: Platform.OS === 'android' ? 50 : 60, 
      paddingBottom: 20, 
      paddingHorizontal: 25, 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      backgroundColor: COLORS.bg,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.borderColor,
  },
  headerTitleClassy: { fontFamily: FONT_TITLE, fontSize: 18, letterSpacing: 2, fontWeight: '800', color: COLORS.textPrimary },
  trashBtnClassy: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.borderColor, borderRadius: 20, backgroundColor: '#F2F2F7' },
  trashBtnTextClassy: { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.5 },

  swiperContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: SCREEN_WIDTH - 40, height: SCREEN_HEIGHT * 0.62,
    backgroundColor: 'white', borderRadius: 12, 
    position: 'absolute',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 4,
    padding: 8, borderWidth: 1, borderColor: COLORS.borderColor
  },
  cardNext: { transform: [{ scale: 0.95 }, { translateY: 15 }], zIndex: -1, opacity: 0.6 },
  cardImage: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#F2F2F7' },
  
  cardInfo: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 5 },
  cardInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardSize: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary },
  cardDate: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  clickHint: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },

  cardEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  overlayLabel: { position: 'absolute', top: 40, borderWidth: 3, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 15, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.85)' },
  overlayText: { fontSize: 22, fontWeight: '800', letterSpacing: 1, fontFamily: FONT_TITLE },

  instructionContainer: { position: 'absolute', bottom: 40, flexDirection: 'row', alignItems: 'center', opacity: 0.5 },
  instructionText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  instructionSeparator: { height: 4, width: 4, borderRadius: 2, backgroundColor: COLORS.textPrimary, marginHorizontal: 20 },

  binHeaderClassy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.borderColor, backgroundColor: COLORS.bg },
  binTitleClassy: { fontSize: 17, fontWeight: '600', fontFamily: FONT_BODY, color: COLORS.textPrimary },
  binSubTitle: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600', marginTop: 2 },
  headerBtnBack: { padding: 10 },
  headerBtnText: { fontSize: 16, color: COLORS.textPrimary, fontFamily: FONT_BODY },
  headerBtnDelete: { fontSize: 16, color: COLORS.accentRed, fontWeight: '600', fontFamily: FONT_BODY, padding: 10 },

  gridItem: { width: SCREEN_WIDTH / 3, height: SCREEN_WIDTH / 3, borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'white' },
  gridImage: { width: '100%', height: '100%' },
  restoreOverlayClassy: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 4, alignItems: 'center' },
  restoreTextClassy: { color: 'white', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  gridSizeOverlay: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 4 },
  gridSizeText: { color: 'white', fontSize: 9, fontWeight: '600'},

  titleClassy: { fontSize: 24, fontWeight: '800', marginBottom: 10, fontFamily: FONT_TITLE, letterSpacing: 1, color: COLORS.textPrimary },
  subTitleClassy: { color: COLORS.textSecondary, marginBottom: 30, fontFamily: FONT_BODY, textAlign: 'center', fontSize: 16 },
  btnClassySolid: { backgroundColor: COLORS.textPrimary, paddingHorizontal: 30, paddingVertical: 16, borderRadius: 12 },
  btnTextSolid: { color: 'white', fontWeight: '700', letterSpacing: 1, fontSize: 13 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1 },

  modalContainer: { flex: 1, backgroundColor: COLORS.overlayBg, justifyContent: 'center', alignItems: 'center' },
  modalCloseArea: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  modalContent: { width: '90%', height: '80%', backgroundColor: 'transparent', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: '85%', borderRadius: 12 },
  modalInfoBar: { position: 'absolute', top: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  modalInfoText: { color: 'white', fontWeight: '600', fontSize: 12 },
  modalCloseBtn: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 30, backgroundColor: 'white', borderRadius: 30 },
  modalCloseText: { fontWeight: '800', color: 'black' }
});