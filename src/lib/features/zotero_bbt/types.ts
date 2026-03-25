export type ZoteroCollection = {
  key: string;
  name: string;
  parent_key?: string;
};

export type ZoteroAttachment = {
  key: string;
  title: string;
  mime_type: string;
  path?: string;
};

export type ZoteroConnectionConfig = {
  mode: "bbt" | "web_api";
  bbt_url?: string;
  api_key?: string;
  user_id?: string;
  group_id?: string;
};
