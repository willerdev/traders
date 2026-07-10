export type AuthStackParamList = {
  Login: undefined;
  Otp: { loginSessionId: string; email: string };
};

export type MainTabParamList = {
  Wallet: undefined;
  MT5: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
