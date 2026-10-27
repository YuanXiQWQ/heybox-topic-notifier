/** @file 定义与账号会话绑定的无 GMS 厂商推送设备。 */
/** 厂商 token 仅保存在服务端及应用私有存储，不返回网页。 */
export type NativePushDevice = {
  id: string;
  userId: string;
  sessionHash: string;
  token: string;
  provider: "honor";
  updatedAt: string;
};
/** 厂商设备的原子换绑与会话条件删除接口。 */
export type NativePushStore = {
  /** @param {string} userId 账号。 @return {Promise<NativePushDevice[]>} 当前设备。 */
  list(userId: string): Promise<NativePushDevice[]>;
  /** @param {NativePushDevice} device 已验证的会话绑定。 */
  save(device: NativePushDevice): Promise<void>;
  /** @param {string} id 设备。 @param {string} userId 账号。 @param {string | undefined} sessionHash 仍属于此会话时才删除。 */
  remove(id: string, userId: string, sessionHash?: string): Promise<void>;
};
