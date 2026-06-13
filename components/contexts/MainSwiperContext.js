import React from 'react';

const MainSwiperContext = React.createContext({
  goToPage: () => {},
  currentPage: 1,
  insideSwiper: false,
  lockSwiper: () => {},
  unlockSwiper: () => {},
});

export const useMainSwiper = () => React.useContext(MainSwiperContext);
export default MainSwiperContext;
