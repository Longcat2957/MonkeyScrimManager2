// 메뉴 항목은 팝오버와 헤더 버튼이 함께 쓰는 값 타입이다.
export type MenuAction = {
    content: string;
    desc?: string;
    disabled?: boolean;
    danger?: boolean;
    current?: boolean;
};
