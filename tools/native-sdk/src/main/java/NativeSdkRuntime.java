/** 在独立 JVM 中执行官方 ARM64 SDK 的采集与封装，网络握手由服务端管理。 */
import com.github.unidbg.AndroidEmulator;
import com.github.unidbg.Emulator;
import com.github.unidbg.arm.backend.Backend;
import com.github.unidbg.arm.backend.Unicorn2Factory;
import com.github.unidbg.file.FileResult;
import com.github.unidbg.file.linux.AndroidFileIO;
import com.github.unidbg.linux.ARM64SyscallHandler;
import com.github.unidbg.linux.android.AndroidARM64Emulator;
import com.github.unidbg.linux.android.AndroidResolver;
import com.github.unidbg.linux.android.dvm.AbstractJni;
import com.github.unidbg.linux.android.dvm.ArrayListObject;
import com.github.unidbg.linux.android.dvm.BaseVM;
import com.github.unidbg.linux.android.dvm.DalvikModule;
import com.github.unidbg.linux.android.dvm.DvmClass;
import com.github.unidbg.linux.android.dvm.DvmObject;
import com.github.unidbg.linux.android.dvm.StringObject;
import com.github.unidbg.linux.android.dvm.VM;
import com.github.unidbg.linux.android.dvm.VarArg;
import com.github.unidbg.linux.android.dvm.array.ByteArray;
import com.github.unidbg.linux.android.dvm.jni.ProxyClassFactory;
import com.github.unidbg.linux.file.ByteArrayFileIO;
import com.github.unidbg.memory.SvcMemory;
import com.github.unidbg.unix.UnixSyscallHandler;
import java.io.File;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import unicorn.Arm64Const;

/** 将原生 SDK 的 JNI 依赖映射到独立 Linux 运行环境。 */
public class NativeSdkRuntime extends AbstractJni {
  /** 当前配置握手提供的加密参数，仅在独立进程内使用。 */
  private final com.alibaba.fastjson.JSONObject options;

  /**
   * 接收同一次握手的动态参数和待封装元数据。
   *
   * @param {JSONObject} options 当前握手的采集输入。
   */
  NativeSdkRuntime(com.alibaba.fastjson.JSONObject options) {
    this.options = options;
  }

  /** 提供主机实际网络接口查询和独立文件系统的 Android ABI 兼容层。 */
  static class HostEmulator extends AndroidARM64Emulator {
    /** 创建只执行采集与封装、不发送网络请求的执行环境。 */
    HostEmulator() {
      super(
          "com.max.xiaoheihe",
          new File("rootfs"),
          Collections.singletonList(new Unicorn2Factory(true)));
    }

    /**
     * 将 Linux 地址查询映射到主机接口；不存在的接口返回 ENODEV。
     *
     * @param {SvcMemory} memory 系统调用内存。
     * @return {UnixSyscallHandler<AndroidFileIO>} 主机兼容的系统调用处理器。
     */
    @Override
    protected UnixSyscallHandler<AndroidFileIO> createSyscallHandler(SvcMemory memory) {
      return new ARM64SyscallHandler(memory) {
        /**
         * 执行 SIOCGIFADDR 查询，其余调用由基础运行库处理。
         *
         * @param {Backend} backend CPU 执行后端。
         * @param {int} intno 中断编号。
         * @param {int} swi 中断操作数。
         * @param {Object} user 当前执行环境。
         */
        @Override
        public void hook(Backend backend, int intno, int swi, Object user) {
          Emulator<?> emulator = (Emulator<?>) user;
          if (intno == 2
              && swi == 0
              && backend.reg_read(Arm64Const.UC_ARM64_REG_X8).intValue() == 29
              && emulator.getContext().getLongArg(1) == 0x8915) {
            com.sun.jna.Pointer query = emulator.getContext().getPointerArg(2);
            String name = query.getString(0);
            try {
              NetworkInterface iface = NetworkInterface.getByName(name);
              if (iface != null)
                for (java.net.InetAddress address : Collections.list(iface.getInetAddresses())) {
                  if (address instanceof Inet4Address) {
                    query.setShort(16, (short) 2);
                    query.write(20, address.getAddress(), 0, 4);
                    backend.reg_write(Arm64Const.UC_ARM64_REG_X0, 0);
                    return;
                  }
                }
            } catch (java.net.SocketException ignored) {
            }
            emulator.getMemory().setErrno(19);
            backend.reg_write(Arm64Const.UC_ARM64_REG_X0, -1);
            return;
          }
          super.hook(backend, intno, swi, user);
        }
      };
    }
  }

  /**
   * 提供与 Android 基础库一致的 API 级别及当前配置握手状态。
   *
   * @param {BaseVM} vm JNI 虚拟机。
   * @param {DvmClass} type 字段所属类型。
   * @param {String} signature 字段签名。
   * @return {int} 当前兼容层的 API 级别。
   */
  @Override
  public int getStaticIntField(BaseVM vm, DvmClass type, String signature) {
    if (signature.equals("android/os/Build$VERSION->SDK_INT:I")) return 23;
    if (signature.equals("com/ishumei/smantifraud/dfp/SMSDK->C:I"))
      return options.containsKey("dynamic") ? 5 : 0;
    return super.getStaticIntField(vm, type, signature);
  }

  /**
   * 向原生库提供本次配置握手的采集列表、加密材料和初始化状态。
   *
   * @param {BaseVM} vm JNI 虚拟机。
   * @param {DvmClass} type 字段所属类型。
   * @param {String} signature 字段签名。
   * @return {DvmObject<?>} 对应的握手状态或 SDK 默认值。
   */
  @Override
  public DvmObject<?> getStaticObjectField(BaseVM vm, DvmClass type, String signature) {
    if (options.containsKey("dynamic")) {
      com.alibaba.fastjson.JSONObject dynamic = options.getJSONObject("dynamic");
      if (signature.equals("com/ishumei/smantifraud/dfp/SMSDK->A:[B"))
        return new ByteArray(vm, java.util.Base64.getDecoder().decode(dynamic.getString("key")));
      if (signature.equals("com/ishumei/smantifraud/dfp/SMSDK->E:[B"))
        return new ByteArray(vm, java.util.Base64.getDecoder().decode(dynamic.getString("iv")));
      if (signature.equals("com/ishumei/smantifraud/dfp/SMSDK->B:Ljava/lang/String;"))
        return new StringObject(
            vm,
            String.join(";;", dynamic.getJSONArray("collectors").toJavaList(String.class)) + ";;");
      if (signature.equals("com/ishumei/smantifraud/dfp/SMSDK->D:Ljava/lang/String;"))
        return new StringObject(vm, dynamic.getString("messageId"));
    }
    if (signature.equals("com/ishumei/smantifraud/dfp/SMSDK->F:Ljava/lang/String;"))
      return new StringObject(vm, "");
    if (signature.startsWith("com/ishumei/smantifraud/dfp/SMSDK->")) return null;
    return super.getStaticObjectField(vm, type, signature);
  }

  /**
   * 对宿主不存在的 Android 框架方法保留标准 JNI 异常，不伪造方法对象。
   *
   * @param {BaseVM} vm JNI 虚拟机。
   * @param {DvmClass} type 方法所属类型。
   * @param {String} signature 方法签名。
   * @return {DvmObject<?>} 不存在的方法返回空并设置异常。
   */
  @Override
  public DvmObject<?> toReflectedMethod(BaseVM vm, DvmClass type, String signature) {
    if (signature.startsWith("android/") || signature.startsWith("libcore/")) {
      vm.throwException(vm.resolveClass("java/lang/NoSuchMethodError").newObject(signature));
      return null;
    }
    return super.toReflectedMethod(vm, type, signature);
  }

  /**
   * 将应用私有目录映射到隔离的兼容层文件系统。
   *
   * @param {BaseVM} vm JNI 虚拟机。
   * @param {DvmObject<?>} object 接收调用的对象。
   * @param {String} signature 方法签名。
   * @param {VarArg} args 方法参数。
   * @return {DvmObject<?>} 文件对象或路径字符串。
   */
  @Override
  public DvmObject<?> callObjectMethod(
      BaseVM vm, DvmObject<?> object, String signature, VarArg args) {
    switch (signature) {
      case "android/content/Context->getFilesDir()Ljava/io/File;":
        return vm.resolveClass("java/io/File")
            .newObject(new File("/data/user/0/com.max.xiaoheihe/files"));
      case "android/content/Context->getPackageName()Ljava/lang/String;":
        return new StringObject(vm, "com.max.xiaoheihe");
      case "java/io/File->getAbsolutePath()Ljava/lang/String;":
      case "java/io/File->getPath()Ljava/lang/String;":
        return new StringObject(vm, object.getValue().toString().replace('\\', '/'));
      case "java/io/File->getParent()Ljava/lang/String;":
        return new StringObject(vm, ((File) object.getValue()).getParent().replace('\\', '/'));
      default:
        return super.callObjectMethod(vm, object, signature, args);
    }
  }

  /**
   * 读取 Java 集合的实际长度。
   *
   * @param {BaseVM} vm JNI 虚拟机。
   * @param {DvmObject<?>} object 集合对象。
   * @param {String} signature 方法签名。
   * @param {VarArg} args 方法参数。
   * @return {int} 当前集合长度。
   */
  @Override
  public int callIntMethod(BaseVM vm, DvmObject<?> object, String signature, VarArg args) {
    if (signature.equals("java/util/ArrayList->size()I"))
      return ((java.util.List<?>) object.getValue()).size();
    return super.callIntMethod(vm, object, signature, args);
  }

  /**
   * 通过标准 Java 编码器实现 Android Base64 的无换行和 URL 安全模式。
   *
   * @param {BaseVM} vm JNI 虚拟机。
   * @param {DvmClass} type 方法所属类型。
   * @param {String} signature 方法签名。
   * @param {VarArg} args 原始数据及编码选项。
   * @return {DvmObject<?>} 转换后的字节数组或字符串。
   */
  @Override
  public DvmObject<?> callStaticObjectMethod(
      BaseVM vm, DvmClass type, String signature, VarArg args) {
    if (signature.equals("android/util/Base64->decode(Ljava/lang/String;I)[B")) {
      String input = (String) args.getObjectArg(0).getValue();
      java.util.Base64.Decoder decoder =
          (args.getIntArg(1) & 8) != 0
              ? java.util.Base64.getUrlDecoder()
              : java.util.Base64.getMimeDecoder();
      return new ByteArray(vm, decoder.decode(input));
    }
    if (signature.equals("android/util/Base64->encodeToString([BI)Ljava/lang/String;")) {
      byte[] input = (byte[]) args.getObjectArg(0).getValue();
      int flags = args.getIntArg(1);
      java.util.Base64.Encoder encoder =
          (flags & 8) != 0 ? java.util.Base64.getUrlEncoder() : java.util.Base64.getEncoder();
      if ((flags & 1) != 0) encoder = encoder.withoutPadding();
      return new StringObject(vm, encoder.encodeToString(input));
    }
    return super.callStaticObjectMethod(vm, type, signature, args);
  }

  /**
   * 从标准输入接收有界握手参数，仅将生成的 SDK 报文返回给父进程。
   *
   * @param {String[]} args 已校验的原生库和公开证书路径。
   */
  public static void main(String[] args) throws Exception {
    java.io.PrintStream output = System.out;
    System.setOut(new java.io.PrintStream(java.io.OutputStream.nullOutputStream()));
    System.setErr(new java.io.PrintStream(java.io.OutputStream.nullOutputStream()));
    com.alibaba.fastjson.parser.ParserConfig.getGlobalInstance().setSafeMode(true);
    byte[] input = System.in.readNBytes(1024 * 1024 + 1);
    if (input.length > 1024 * 1024
        || args.length != 2
        || !System.getProperty("os.name").equals("Linux")) System.exit(2);
    com.alibaba.fastjson.JSONObject options =
        com.alibaba.fastjson.JSON.parseObject(
            new String(input, java.nio.charset.StandardCharsets.UTF_8));
    Files.createDirectories(Path.of("rootfs/data/user/0/com.max.xiaoheihe/files"));
    try (AndroidEmulator emulator = new HostEmulator()) {
      emulator.getMemory().setLibraryResolver(new AndroidResolver(23));
      emulator
          .getSyscallHandler()
          .addIOResolver((em, pathname, flags) -> {
            if (java.util.Arrays.asList(
                        "/proc/mounts",
                        "/proc/self/mounts",
                        "/proc/self/mountinfo",
                        "/proc/self/cgroup",
                        "/proc/stat",
                        "/proc/tty/drivers",
                        "/proc/cpuinfo",
                        "/proc/meminfo",
                        "/proc/version",
                        "/proc/net/dev",
                        "/proc/net/arp",
                        "/proc/net/route",
                        "/proc/loadavg")
                    .contains(pathname)
                && Files.isReadable(Path.of(pathname))) {
              try {
                return FileResult.success(
                    new ByteArrayFileIO(flags, pathname, Files.readAllBytes(Path.of(pathname))));
              } catch (java.io.IOException unavailable) {
                return FileResult.failed(5);
              }
            }
            return null;
          });
      VM vm = emulator.createDalvikVM();
      NativeSdkRuntime jni = new NativeSdkRuntime(options);
      ProxyClassFactory javaClasses = new ProxyClassFactory();
      javaClasses.setFallbackJni(jni);
      vm.setDvmClassFactory((base, name, parent, interfaces) ->
          name.startsWith("java/")
                  || name.startsWith("javax/")
                  || name.startsWith("sun/")
                  || name.startsWith("com/sun/")
              ? javaClasses.createClass(base, name, parent, interfaces)
              : null);
      vm.addNotFoundClass("android/hardware/camera2/CameraManager");
      vm.addNotFoundClass("android/hardware/Camera");
      vm.setJni(jni);
      vm.setVerbose(false);
      DalvikModule module = vm.loadLibrary(new File(args[0]), true);
      module.callJNI_OnLoad(emulator);
      DvmClass sdk = vm.resolveClass("com/ishumei/smantifraud/dfp/SMSDK");
      sdk.callStaticJniMethod(
          emulator,
          "u4(Ljava/lang/String;Ljava/lang/String;)V",
          new StringObject(vm, "/data/app/com.max.xiaoheihe"),
          new StringObject(vm, "/data/user/0/com.max.xiaoheihe"));
      DvmObject<?> result =
          sdk.callStaticJniMethodObject(
              emulator,
              "w1(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;JLjava/lang/String;Ljava/util/List;)Ljava/lang/String;",
              vm.resolveClass("android/content/Context").newObject(null),
              new StringObject(
                  vm,
                  options.containsKey("sdkPayload")
                      ? options.getJSONObject("sdkPayload").toJSONString()
                      : "{}"),
              null,
              options.containsKey("config")
                  ? new StringObject(vm, options.getJSONObject("config").toJSONString())
                  : null,
              new StringObject(vm, Files.readString(Path.of(args[1]))),
              new StringObject(vm, "0yD85BjYvGFAvHaSQ1mc"),
              new StringObject(vm, "default"),
              new StringObject(vm, ""),
              System.currentTimeMillis(),
              new StringObject(vm, ""),
              new ArrayListObject(vm, new java.util.ArrayList<>()));
      if (result == null) System.exit(2);
      String payload = result.getValue().toString();
      com.alibaba.fastjson.JSONObject parsed = com.alibaba.fastjson.JSON.parseObject(payload);
      if (payload.length() > 1024 * 1024
          || !parsed.containsKey("msgId")
          || !parsed.containsKey("data")) System.exit(2);
      output.print(payload);
    }
  }
}
