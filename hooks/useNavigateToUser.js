import { useContext } from 'react';
import { useNavigation } from '@react-navigation/native';
import { UserContext } from '../components/contexts/UserContext';
import { mapProfileUser } from '../utils/mappers';
import MainSwiperContext from '../components/contexts/MainSwiperContext';

export function useNavigateToUser() {
  const navigation = useNavigation();
  const { user: appUser } = useContext(UserContext);
  const { goToPage, insideSwiper } = useContext(MainSwiperContext);

  return (user) => {
    const userId = user._id || user.id;
    const myId = appUser?._id;
    if (userId && myId && String(userId) === String(myId)) {
      // MyAccount is now swiper page 2, not a navigation screen.
      if (insideSwiper) {
        goToPage(2);
      } else {
        // Called from a screen outside the swiper (e.g. LocationScreen):
        // navigate back to MainTabs; the swiper will be on its last page.
        navigation.navigate('MainTabs');
      }
      return;
    }
    navigation.navigate('UserProfile', { user: mapProfileUser(user) });
  };
}
