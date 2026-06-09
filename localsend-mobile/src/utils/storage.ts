import * as SecureStore from 'expo-secure-store';

const ALIAS_KEY = 'user_alias';

export const saveAlias = async (alias: string) => {
  await SecureStore.setItemAsync(ALIAS_KEY, alias);
};

export const getAlias = async () => {
  return await SecureStore.getItemAsync(ALIAS_KEY);
};