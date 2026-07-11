export type AuthStackParamList = {
  Login: undefined;
  Otp: { loginSessionId: string; email: string };
};

export type MainTabParamList = {
  Wallet: undefined;
  Charts: undefined;
  Trade: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
