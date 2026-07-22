export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  Otp: { loginSessionId: string; email: string };
};

export type HomeStackParamList = {
  HomeMain: undefined;
  RegistrationPayment: undefined;
  Journal: undefined;
  Payouts: undefined;
};

export type WalletStackParamList = {
  WalletMain: undefined;
  Deposit: undefined;
  Withdraw: undefined;
  Transactions: undefined;
  Journal: undefined;
  SavedWallets: undefined;
};

export type InvestStackParamList = {
  InvestMain: undefined;
};

export type MessagesStackParamList = {
  MessagesMain: undefined;
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Wallet: undefined | { screen?: keyof WalletStackParamList };
  Invest: undefined;
  Messages: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
