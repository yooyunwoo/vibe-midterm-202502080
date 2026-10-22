(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});

  Cafe.CATEGORIES = [
    { id: 'all', label: '전체' },
    { id: 'coffee', label: '커피' },
    { id: 'non-coffee', label: '논커피' },
    { id: 'dessert', label: '디저트' }
  ];

  // 음료에만 적용되는 추가 옵션. 디저트는 옵션 없이 수량만 선택한다.
  Cafe.OPTIONS = [
    { id: 'shot', label: '샷 추가', extra: 500 },
    { id: 'syrup', label: '시럽 추가', extra: 0 }
  ];

  Cafe.STATUS = {
    received: '접수',
    preparing: '준비중',
    done: '완료',
    canceled: '취소'
  };

  Cafe.MENU_SEED = [
    { id: 'm001', name: '아메리카노', category: 'coffee', price: 4000, description: '깊고 진한 에스프레소에 물을 더한 기본 커피', image: '☕', stock: 20, soldOut: false },
    { id: 'm002', name: '카페라떼', category: 'coffee', price: 4500, description: '에스프레소와 부드러운 우유의 조화', image: '🥛', stock: 20, soldOut: false },
    { id: 'm003', name: '바닐라라떼', category: 'coffee', price: 5000, description: '달콤한 바닐라 시럽을 더한 라떼', image: '🍯', stock: 20, soldOut: false },
    { id: 'm006', name: '녹차라떼', category: 'non-coffee', price: 5000, description: '진한 말차와 우유로 만든 라떼', image: '🍵', stock: 20, soldOut: false },
    { id: 'm008', name: '딸기 스무디', category: 'non-coffee', price: 5500, description: '생딸기를 갈아 만든 상큼한 스무디', image: '🍓', stock: 20, soldOut: false },
    { id: 'm010', name: '치즈케이크', category: 'dessert', price: 6500, description: '꾸덕하고 진한 크림치즈 케이크', image: '🍰', stock: 10, soldOut: false },
    { id: 'm011', name: '크루아상', category: 'dessert', price: 4000, description: '겹겹이 바삭한 버터 크루아상', image: '🥐', stock: 10, soldOut: false },
    { id: 'm012', name: '초코 쿠키', category: 'dessert', price: 3000, description: '초코칩이 가득한 수제 쿠키', image: '🍪', stock: 10, soldOut: false },
    { id: 'm013', name: '마카롱', category: 'dessert', price: 3500, description: '쫀득한 꼬끄의 수제 마카롱', image: '🌸', stock: 0, soldOut: true }
  ];
})();
