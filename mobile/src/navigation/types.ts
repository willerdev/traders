export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  Otp: { loginSessionId: string; email: string };
};

export type HomeStackParamList = {
  HomeMain: undefined;
  RegistrationPayment: undefined;
  Payouts: undefined;
};

export type JournalStackParamList = {
  JournalMain: undefined;
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
  ChainEnroll: undefined;
  Unitrust: undefined;
  Loans: undefined;
};

export type AccountStackParamList = {
  AccountMain: undefined;
  MessagesMain: undefined;
  SettingsMain: undefined;
  Payouts: undefined;
  Terms: undefined;
  Kyc: undefined;
  ChainEnroll: undefined;
  SavedWallets: undefined;
  Unitrust: undefined;
};

export type MainTabParamList = {
  Home: undefined | { screen?: keyof HomeStackParamList };
  Wallet: undefined | { screen?: keyof WalletStackParamList };
  Journal: undefined;
  Invest: undefined | { screen?: keyof InvestStackParamList };
  Account: undefined | { screen?: keyof AccountStackParamList };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined | { screen?: keyof MainTabParamList; params?: object };
};
