export interface Message {
  key: string;
  value: string;
}

export interface PalimpServerBackendAdapter {
  loadMessages: () => Promise<Message[]>;
}

/**
 * One key the host declares as editable without it appearing on the page.
 * The motivating case is metadata read through `p(key, { asString: true })`,
 * which renders no element and therefore no editor.
 */
export interface PalimpField {
  key: string;
  label: string;
  defaultMessage?: string;
}

export interface User {
  id: string;

  email: string;
  name: string | undefined;

  publishToken: string | undefined;
}
