/**
 * @file 本文件提供修改显示名称时触发的《逆转裁判》主题彩蛋。
 */

/**
 * 创建当前页面使用的法庭改名事件。
 *
 * 角色资料和当前本地化均由游戏入口从内联 JSON 同步准备；该事件只承担演出与交互行为。
 *
 * @param {{characters: object[], messages: object}} configuration 已准备的静态资料。
 * @return {{activate: (username: string, target?: string) => Promise<boolean>, imageLocale: () => string, matches: (username: string) => boolean, theme: (username: string) => string|undefined, voiceLocale: (username?: string) => string}} 彩蛋公开 API。
 */
function createCourtroomNameChange(configuration) {
  const usernameEasterEggCharacters = configuration.characters;
  const usernameEasterEggMessages = configuration.messages;

  /** 《逆转裁判》在跨游戏彩蛋协调器中的唯一标识。 */
  const aceAttorneyEasterEggGameId = "ace-attorney";

/**
 * 当前正在播放的彩蛋音频。
 */
const usernameEasterEggAudios = new Set();

/**
 * 角色台词图片在收起前的停留时间。
 */
const usernameEasterEggCueDurationMs = 1050;

/**
 * 字幕逐字显示的间隔时间。
 */
const usernameEasterEggTypeIntervalMs = 52;

/**
 * 选项转场音效结束后显示按钮的等待时间。
 */
const usernameEasterEggChoiceRevealDelayMs = 170;

/**
 * 选中按钮音效结束后推进剧情的等待时间。
 */
const usernameEasterEggChoiceSelectDelayMs = 245;

/**
 * 当前彩蛋交互 Promise，避免重复打开多个彩蛋。
 */
let activeUsernameEasterEgg;

/**
 * 规范化用于彩蛋匹配的姓名，忽略大小写、Unicode 表示差异和姓名间空白。
 *
 * @param {string} value 待匹配的用户名。
 * @return {string} 规范化后的姓名。
 */
function normalizeEasterEggUsername(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(
    /\s+/gu,
    "",
  );
}

/**
 * 查找用户名对应的彩蛋角色，允许姓和名颠倒。
 *
 * @param {string} username 用户输入的用户名。
 * @return {{key: string, theme: "trilogy"|"aa456"|"investigations", type: string}|undefined} 匹配的角色信息。
 */
function matchingUsernameEasterEggCharacter(username) {
  const candidate = normalizeEasterEggUsername(username);
  if (!candidate) {
    return undefined;
  }

  return usernameEasterEggCharacters.find((character) =>
    character.names.some(([firstName, lastName]) => {
      const forward = normalizeEasterEggUsername(`${firstName}${lastName}`);
      const reverse = normalizeEasterEggUsername(`${lastName}${firstName}`);
      return candidate === forward || candidate === reverse;
    })
  );
}

/**
 * 判断用户名是否可以触发彩蛋。
 *
 * @param {string} username 用户输入的用户名。
 * @return {boolean} 可以触发彩蛋时返回 true。
 */
function matchesUsernameEasterEgg(username) {
  return Boolean(matchingUsernameEasterEggCharacter(username));
}

/**
 * 获取姓名对应的彩蛋界面主题。
 *
 * @param {string} username 用户输入的用户名或显示名称。
 * @return {"trilogy"|"aa456"|"investigations"|undefined} 匹配角色使用的界面主题。
 */
function usernameEasterEggTheme(username) {
  return matchingUsernameEasterEggCharacter(username)?.theme;
}

/**
 * 根据页面语言及角色资源集选择彩蛋语音资源语言。
 *
 * 中文和英文语言系列分别回退至简体中文与美式英语；其余语言仅在角色所属
 * 资源集中存在完全匹配的目录时才使用该目录，否则回退至美式英语。
 *
 * @param {{theme: "trilogy"|"aa456"|"investigations"}} [character] 当前角色信息。
 * @return {"de-DE"|"en-US"|"es-ES"|"fr-FR"|"ja-JP"|"ko-KR"|"pt-BR"|"zh-CN"} 彩蛋语音语言目录。
 */
function usernameEasterEggVoiceLocale(character) {
  const locale = document.documentElement.lang.toLocaleLowerCase("en-US");
  const voiceCollection = character?.theme === "aa456" ? "aa456" : "aa123";
  const supportedLocales = {
    aa123: [
      "de-DE",
      "en-US",
      "es-ES",
      "fr-FR",
      "ja-JP",
      "ko-KR",
      "pt-BR",
      "zh-CN",
    ],
    aa456: ["de-DE", "en-US", "fr-FR", "ja-JP", "ko-KR", "zh-CN"],
  };
  if (locale.startsWith("zh")) {
    return "zh-CN";
  }
  if (locale.startsWith("en")) {
    return "en-US";
  }
  return supportedLocales[voiceCollection].find((supportedLocale) =>
    supportedLocale.toLocaleLowerCase("en-US") === locale
  ) ?? "en-US";
}

/**
 * 获取角色语音所在的资源集目录。
 *
 * @param {{theme: "trilogy"|"aa456"|"investigations"}} character 当前角色信息。
 * @return {"aa123"|"aa456"} 角色语音资源集目录。
 */
function usernameEasterEggVoiceCollection(character) {
  return character.theme === "aa456" ? "aa456" : "aa123";
}

/**
 * 将角色键名转换为音频目录使用的短横线命名。
 *
 * @param {string} characterKey 角色键名。
 * @return {string} 音频目录中的角色名。
 */
function usernameEasterEggAudioCharacterName(characterKey) {
  return characterKey.replace(
    /[A-Z]/gu,
    (letter) => `-${letter.toLowerCase()}`,
  );
}

/**
 * 判断当前页面是否使用英语系列语言。
 *
 * 该判断独立于语音资源回退：只有英语系列语言会触发成步堂龙一的特殊 BGM。
 *
 * @return {boolean} 当前页面使用英语系列语言时返回 true。
 */
function usesEnglishUsernameEasterEggLocale() {
  return document.documentElement.lang.toLocaleLowerCase("en-US").startsWith(
    "en",
  );
}

/**
 * 根据页面语言选择彩蛋台词图片语言，中文按简繁体回退，其余缺失语言回退美式英语。
 *
 * @return {"de-DE"|"en-US"|"es-ES"|"fr-FR"|"ja-JP"|"ko-KR"|"pt-BR"|"zh-CN"|"zh-TW"} 彩蛋图片语言目录。
 */
function usernameEasterEggImageLocale() {
  const locale = document.documentElement.lang.toLocaleLowerCase("en-US");
  const exactLocales = {
    "de-de": "de-DE",
    "en-us": "en-US",
    "es-es": "es-ES",
    "fr-fr": "fr-FR",
    "ja-jp": "ja-JP",
    "ko-kr": "ko-KR",
    "pt-br": "pt-BR",
    "zh-cn": "zh-CN",
    "zh-tw": "zh-TW",
  };
  const exactLocale = exactLocales[locale];
  if (exactLocale) {
    return exactLocale;
  }
  if (["zh-hk", "zh-mo"].includes(locale)) {
    return "zh-TW";
  }
  if (locale.startsWith("zh")) {
    return "zh-CN";
  }
  return "en-US";
}

/**
 * 判断角色当前台词是否应使用《逆转裁判456》中文感叹词图集。
 *
 * @param {{theme: "trilogy"|"aa456"|"investigations"}} character 当前角色信息。
 * @param {"de-DE"|"en-US"|"es-ES"|"fr-FR"|"ja-JP"|"ko-KR"|"pt-BR"|"zh-CN"|"zh-TW"} imageLocale 图片语言目录。
 * @param {"igiari"|"matta"|"kurae"} cue 台词资源名。
 * @return {boolean} 需要从图集截取感叹词时返回 true。
 */
function usesAa456ChineseInterjection(character, imageLocale, cue) {
  return character.theme === "aa456" &&
    ["zh-CN", "zh-TW"].includes(imageLocale) &&
    ["igiari", "kurae"].includes(cue);
}

/**
 * 获取角色当前台词应使用的图片资源地址。
 *
 * 《逆转裁判456》的王泥喜法介与希月心音在中文中直接引用“反对”和“看这个”
 * 所在的图集，其他角色及台词继续使用通用资源。
 *
 * @param {string} assetRoot 彩蛋资源根目录。
 * @param {{theme: "trilogy"|"aa456"|"investigations"}} character 当前角色信息。
 * @param {"de-DE"|"en-US"|"es-ES"|"fr-FR"|"ja-JP"|"ko-KR"|"pt-BR"|"zh-CN"|"zh-TW"} imageLocale 图片语言目录。
 * @param {"igiari"|"matta"|"kurae"} cue 台词资源名。
 * @return {string} 图片资源地址。
 */
function usernameEasterEggImageSource(assetRoot, character, imageLocale, cue) {
  if (usesAa456ChineseInterjection(character, imageLocale, cue)) {
    return `${assetRoot}/Common/Derived/images/interjections/${imageLocale}.png`;
  }
  return `${assetRoot}/Common/Derived/images/${imageLocale}/${cue}.png`;
}

/**
 * 获取当前页面语言对应的彩蛋交互文案。
 *
 * @return {typeof usernameEasterEggMessages.en} 彩蛋交互文案。
 */
function currentUsernameEasterEggMessages() {
  return usernameEasterEggMessages;
}

/**
 * 播放一段彩蛋音频并跟踪其生命周期。
 *
 * @param {string} source 音频资源地址。
 * @param {boolean} [loop=false] 是否循环播放。
 * @return {HTMLAudioElement} 创建的音频元素。
 */
function playUsernameEasterEggAudio(source, loop = false) {
  const audio = new Audio(source);
  audio.loop = loop;
  usernameEasterEggAudios.add(audio);
  audio.addEventListener(
    "ended",
    () => usernameEasterEggAudios.delete(audio),
    { once: true },
  );
  void audio.play().catch(() => {
    usernameEasterEggAudios.delete(audio);
  });
  return audio;
}

/**
 * 停止并释放一段彩蛋音频。
 *
 * @param {HTMLAudioElement|undefined} audio 要停止的音频。
 */
function stopUsernameEasterEggAudio(audio) {
  if (!audio) {
    return;
  }
  audio.pause();
  audio.currentTime = 0;
  usernameEasterEggAudios.delete(audio);
}

/**
 * 停止并释放当前所有彩蛋音频。
 */
function stopAllUsernameEasterEggAudio() {
  [...usernameEasterEggAudios].forEach(stopUsernameEasterEggAudio);
}

/**
 * 为彩蛋画面重新触发抖动动画。
 *
 * @param {HTMLElement} element 要播放动画的元素。
 */
function shakeUsernameEasterEggElement(element) {
  element.classList.remove("is-shaking");
  void element.offsetWidth;
  element.classList.add("is-shaking");
}

/**
 * 创建彩蛋操作按钮。
 *
 * @param {string} label 按钮文字。
 * @param {"primary"|"secondary"} kind 按钮样式。
 * @param {() => void} action 点击后执行的操作。
 * @return {HTMLButtonElement} 创建的按钮。
 */
function createUsernameEasterEggButton(label, kind, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `username-easter-egg-button ${kind}`;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}

/**
 * 打开用户名彩蛋并在三段交互完成后返回用户选择。
 *
 * @param {string} username 用户输入的用户名。
 * @param {"displayName"|"username"} [target="username"] 正在修改的名称类型。
 * @return {Promise<boolean>} 完成彩蛋时返回 true，取消改名时返回 false。
 */
function activateUsernameEasterEgg(username, target = "username") {
  const character = matchingUsernameEasterEggCharacter(username);
  if (!character) {
    return Promise.resolve(true);
  }
  if (activeUsernameEasterEgg) {
    return activeUsernameEasterEgg;
  }

  activeUsernameEasterEgg = new Promise((resolve) => {
    const voiceLocale = usernameEasterEggVoiceLocale(character);
    const imageLocale = usernameEasterEggImageLocale();
    const messages = currentUsernameEasterEggMessages();
    const assetRoot = "/static/fun/ace-attorney";
    const prefersReducedMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches ?? false;
    const overlay = document.createElement("div");
    const image = document.createElement("div");
    const panel = document.createElement("section");
    const speaker = document.createElement("span");
    const message = document.createElement("p");
    const continueButton = document.createElement("button");
    const actions = document.createElement("div");
    let backgroundAudio;
    let choiceLocked = false;
    let finalized = false;
    let stageSequence = 0;
    let typewriterTimer;
    let skipTypewriter;
    let continueFinalDialogue;

    overlay.className =
      `username-easter-egg-overlay username-easter-egg-theme-${character.theme}`;
    overlay.dataset.usernameEasterEggOverlay = "";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", messages.alt);
    image.className = "username-easter-egg-image";
    image.setAttribute("role", "img");
    image.setAttribute("aria-label", messages.alt);
    panel.className = "username-easter-egg-panel";
    panel.hidden = true;
    speaker.className = "username-easter-egg-speaker";
    speaker.textContent = username.trim();
    message.className = "username-easter-egg-message";
    message.setAttribute("aria-live", "polite");
    continueButton.type = "button";
    continueButton.className = "username-easter-egg-continue";
    continueButton.setAttribute("aria-label", messages.continue);
    continueButton.hidden = true;
    actions.className = "username-easter-egg-actions";
    actions.hidden = true;
    panel.append(speaker, message, continueButton);
    overlay.append(image, panel, actions);
    document.body.append(overlay);
    document.body.classList.add("username-easter-egg-active");

    /**
     * 生成角色语音资源地址。
     *
     * @param {"igiari"|"matta"|"kurae"} cue 台词资源名。
     * @return {string} 语音资源地址。
     */
    function voiceSource(cue) {
      const voiceCollection = usernameEasterEggVoiceCollection(character);
      const characterName = usernameEasterEggAudioCharacterName(character.key);
      const collectionRoot = voiceCollection === "aa456"
        ? "AA456/natives/stm/sound/gs5/se/voice"
        : "AA123/StreamingAssets/Sound/se/strm/voice";
      return `${assetRoot}/${collectionRoot}/${voiceLocale}/${characterName}/${cue}.wav`;
    }

    /**
     * 生成当前角色的背景音乐资源地址。
     *
     * @param {"msc-objection"|"msc-pressingPursuit"} track 音乐资源名。
     * @return {string} 背景音乐资源地址。
     */
    function musicSource(track) {
      const englishPhoenixDirectory = character.key === "phoenixWright" &&
          usesEnglishUsernameEasterEggLocale()
        ? "/en-UK"
        : "";
      const characterName = usernameEasterEggAudioCharacterName(character.key);
      return `${assetRoot}/Common/Derived/sounds/bgm-${characterName}${englishPhoenixDirectory}/${track}.mp3`;
    }

    /**
     * 生成通用彩蛋音效资源地址。
     *
     * @param {"sfx-blipmale"|"sfx-gavel"|"sfx-pichoop"|"sfx-selectblip2"|"sfx-whoops"} effect 音效名。
     * @return {string} 通用音效资源地址。
     */
    function soundEffectSource(effect) {
      return `${assetRoot}/Common/Derived/sounds/${effect}.wav`;
    }

    /**
     * 等待指定的彩蛋演出时间。
     *
     * @param {number} milliseconds 等待毫秒数。
     * @return {Promise<void>} 等待结束后的 Promise。
     */
    function waitForStageDelay(milliseconds) {
      return new Promise((resolveDelay) => {
        globalThis.setTimeout(resolveDelay, milliseconds);
      });
    }

    /**
     * 切换彩蛋画面并播放对应角色语音。
     *
     * @param {"igiari"|"matta"|"kurae"} cue 台词资源名。
     */
    function showCue(cue) {
      const isAa456ChineseInterjection = usesAa456ChineseInterjection(
        character,
        imageLocale,
        cue,
      );
      image.style.backgroundImage = `url("${
        usernameEasterEggImageSource(
          assetRoot,
          character,
          imageLocale,
          cue,
        )
      }")`;
      image.classList.toggle(
        "is-aa456-chinese-interjection",
        isAa456ChineseInterjection,
      );
      image.classList.toggle(
        "is-aa456-kurae-interjection",
        isAa456ChineseInterjection && cue === "kurae",
      );
      image.hidden = false;
      document.body.classList.remove("username-easter-egg-impact");
      void overlay.offsetWidth;
      document.body.classList.add("username-easter-egg-impact");
      shakeUsernameEasterEggElement(image);
      playUsernameEasterEggAudio(voiceSource(cue));
    }

    /**
     * 逐字显示一段字幕，并允许用户点击后立即完成字幕。
     *
     * @param {string} text 对话文字。
     * @param {number} sequence 当前演出序号。
     * @return {Promise<void>} 字幕显示完毕后的 Promise。
     */
    function typeDialogueMessage(text, sequence) {
      message.textContent = "";
      if (prefersReducedMotion) {
        message.textContent = text;
        return Promise.resolve();
      }

      return new Promise((resolveTyping) => {
        const characters = [...text];
        let index = 0;
        let completed = false;

        /**
         * 完成本轮字幕显示。
         *
         * @param {boolean} revealAll 是否立即显示全部字幕。
         */
        function completeTyping(revealAll) {
          if (completed) {
            return;
          }
          completed = true;
          if (typewriterTimer !== undefined) {
            globalThis.clearTimeout(typewriterTimer);
            typewriterTimer = undefined;
          }
          if (revealAll) {
            message.textContent = text;
          }
          skipTypewriter = undefined;
          resolveTyping();
        }

        /**
         * 显示下一个字幕字符。
         */
        function revealNextCharacter() {
          if (sequence !== stageSequence) {
            completeTyping(false);
            return;
          }

          const characterText = characters[index];
          message.textContent += characterText;
          if (/\S/u.test(characterText)) {
            playUsernameEasterEggAudio(
              soundEffectSource("sfx-blipmale"),
            );
          }
          index += 1;
          if (index >= characters.length) {
            completeTyping(false);
            return;
          }
          typewriterTimer = globalThis.setTimeout(
            revealNextCharacter,
            usernameEasterEggTypeIntervalMs,
          );
        }

        skipTypewriter = () => completeTyping(true);
        if (characters.length === 0) {
          completeTyping(false);
          return;
        }
        revealNextCharacter();
      });
    }

    /**
     * 创建带有游戏选择音效的剧情按钮。
     *
     * @param {string} label 按钮文字。
     * @param {"primary"|"secondary"} kind 按钮样式。
     * @param {() => void} action 音效结束后执行的剧情动作。
     * @return {HTMLButtonElement} 创建的剧情按钮。
     */
    function createChoiceButton(label, kind, action) {
      const button = createUsernameEasterEggButton(label, kind, () => {
        if (choiceLocked) {
          return;
        }
        choiceLocked = true;
        actions.hidden = true;
        overlay.classList.remove("is-choosing");
        playUsernameEasterEggAudio(soundEffectSource("sfx-selectblip2"));
        const sequence = stageSequence;
        void waitForStageDelay(usernameEasterEggChoiceSelectDelayMs).then(
          () => {
            if (sequence === stageSequence) {
              action();
            }
          },
        );
      });

      /**
       * 将当前按钮标记为游戏菜单中的选中项。
       */
      function markChoiceAsSelected() {
        actions.querySelectorAll(".is-selected").forEach((selectedButton) => {
          selectedButton.classList.remove("is-selected");
        });
        button.classList.add("is-selected");
      }

      button.addEventListener("focus", markChoiceAsSelected);
      button.addEventListener("mouseenter", markChoiceAsSelected);
      return button;
    }

    /**
     * 播放最终转场音效并结束彩蛋。
     */
    function completeFinalDialogue() {
      if (!continueFinalDialogue || choiceLocked) {
        return;
      }
      choiceLocked = true;
      const action = continueFinalDialogue;
      const sequence = stageSequence;
      continueFinalDialogue = undefined;
      continueButton.disabled = true;
      playUsernameEasterEggAudio(soundEffectSource("sfx-pichoop"));
      void waitForStageDelay(usernameEasterEggChoiceRevealDelayMs).then(() => {
        if (sequence === stageSequence) {
          action();
        }
      });
    }

    /**
     * 播放一轮台词图片、逐字字幕和选择按钮演出。
     *
     * @param {"igiari"|"matta"|"kurae"} cue 台词资源名。
     * @param {string} text 本轮字幕。
     * @param {{action: () => void, kind: "primary"|"secondary", label: string}[]} choices 本轮选项。
     * @param {"msc-objection"|"msc-pressingPursuit"} [musicTrack] 需要切换的背景音乐。
     * @param {(() => void)|undefined} [finalAction] 无选项时点击双箭头执行的最终操作。
     * @return {Promise<void>} 本轮交互提示显示完毕后的 Promise。
     */
    async function showDialogueStage(
      cue,
      text,
      choices,
      musicTrack,
      finalAction,
    ) {
      const sequence = ++stageSequence;
      choiceLocked = false;
      skipTypewriter = undefined;
      continueFinalDialogue = undefined;
      continueButton.disabled = false;
      continueButton.hidden = true;
      actions.hidden = true;
      panel.hidden = true;
      overlay.classList.remove("is-dialogue", "is-choosing", "is-continuable");
      if (musicTrack) {
        stopUsernameEasterEggAudio(backgroundAudio);
        backgroundAudio = playUsernameEasterEggAudio(
          musicSource(musicTrack),
          true,
        );
      }
      showCue(cue);

      await waitForStageDelay(usernameEasterEggCueDurationMs);
      if (sequence !== stageSequence) {
        return;
      }
      image.classList.remove("is-shaking");
      document.body.classList.remove("username-easter-egg-impact");
      image.hidden = true;
      panel.hidden = false;
      overlay.classList.add("is-dialogue");
      await typeDialogueMessage(text, sequence);
      if (sequence !== stageSequence) {
        return;
      }

      if (finalAction) {
        continueFinalDialogue = finalAction;
        continueButton.hidden = false;
        overlay.classList.add("is-continuable");
        continueButton.focus();
        return;
      }

      playUsernameEasterEggAudio(soundEffectSource("sfx-pichoop"));
      await waitForStageDelay(usernameEasterEggChoiceRevealDelayMs);
      if (sequence !== stageSequence) {
        return;
      }
      const buttons = choices.map((choice) =>
        createChoiceButton(choice.label, choice.kind, choice.action)
      );
      actions.replaceChildren(...buttons);
      buttons[0]?.classList.add("is-selected");
      actions.hidden = false;
      overlay.classList.add("is-choosing");
      buttons[0]?.focus();
    }

    /**
     * 关闭彩蛋、恢复页面交互并返回最终结果。
     *
     * @param {boolean} approved 是否继续提交用户名。
     * @param {"sfx-gavel"|"sfx-whoops"|undefined} [finalSoundEffect] 结束时播放的音效。
     */
    function finish(approved, finalSoundEffect) {
      stageSequence += 1;
      skipTypewriter?.();
      document.removeEventListener("keydown", handleKeydown);
      overlay.removeEventListener("click", handleOverlayClick);
      stopAllUsernameEasterEggAudio();

      /**
       * 移除彩蛋界面并返回用户选择。
       */
      function finalizeEasterEgg() {
        if (finalized) {
          return;
        }
        finalized = true;
        overlay.remove();
        document.body.classList.remove(
          "username-easter-egg-active",
          "username-easter-egg-impact",
        );
        activeUsernameEasterEgg = undefined;
        globalThis.easterEggCoordinator?.finish(
          aceAttorneyEasterEggGameId,
          stopEasterEgg,
        );
        resolve(approved);
      }

      if (!finalSoundEffect) {
        finalizeEasterEgg();
        return;
      }

      const finalAudio = playUsernameEasterEggAudio(
        soundEffectSource(finalSoundEffect),
      );
      const fallbackTimer = globalThis.setTimeout(finalizeEasterEgg, 1_500);

      /**
       * 在结束音效播放完毕后继续提交或取消改名。
       */
      function finalizeAfterFinalSound() {
        globalThis.clearTimeout(fallbackTimer);
        finalizeEasterEgg();
      }

      finalAudio.addEventListener("ended", finalizeAfterFinalSound, {
        once: true,
      });
      finalAudio.addEventListener("error", finalizeAfterFinalSound, {
        once: true,
      });
    }

    /**
     * 展示“接招”阶段并等待用户点击双箭头结束。
     */
    function showFinalStage() {
      void showDialogueStage(
        "kurae",
        messages.finish,
        [],
        "msc-pressingPursuit",
        () => finish(true, "sfx-gavel"),
      );
    }

    /**
     * 展示“且慢”阶段并询问姓名用途。
     */
    function showQuestionStage() {
      void showDialogueStage("matta", messages.question, [
        {
          action: showFinalStage,
          kind: "primary",
          label: messages.realName,
        },
        {
          action: showFinalStage,
          kind: "secondary",
          label: messages.forFun,
        },
      ]);
    }

    /**
     * 点击彩蛋画面时跳过逐字动画或完成最终交互。
     *
     * @param {MouseEvent} event 鼠标点击事件。
     */
    function handleOverlayClick(event) {
      if (skipTypewriter) {
        event.preventDefault();
        skipTypewriter();
        return;
      }
      if (continueFinalDialogue) {
        event.preventDefault();
        completeFinalDialogue();
      }
    }

    /**
     * 处理彩蛋键盘交互，支持跳过、完成或取消本次改名。
     *
     * @param {KeyboardEvent} event 键盘事件。
     */
    function handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        return;
      }
      if (skipTypewriter && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        skipTypewriter();
        return;
      }
      if (
        continueFinalDialogue &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        completeFinalDialogue();
      }
    }

    /**
     * 由跨游戏彩蛋协调器立即关闭本次《逆转裁判》彩蛋。
     */
    function stopEasterEgg() {
      finish(false);
    }

    globalThis.easterEggCoordinator?.start(
      aceAttorneyEasterEggGameId,
      stopEasterEgg,
    );
    document.addEventListener("keydown", handleKeydown);
    overlay.addEventListener("click", handleOverlayClick);
    continueButton.addEventListener("click", (event) => {
      event.stopPropagation();
      completeFinalDialogue();
    });
    const confirmation = target === "displayName"
      ? messages.confirmDisplayName
      : messages.confirmUsername;
    void showDialogueStage(
      "igiari",
      `${confirmation} “${username.trim()}”？`,
      [
        {
          action: showQuestionStage,
          kind: "primary",
          label: messages.yes,
        },
        {
          action: () => finish(false, "sfx-whoops"),
          kind: "secondary",
          label: messages.no,
        },
      ],
      "msc-objection",
    );
  });

  return activeUsernameEasterEgg;
}

  return Object.freeze({
    activate: activateUsernameEasterEgg,
    imageLocale: usernameEasterEggImageLocale,
    matches: matchesUsernameEasterEgg,
    theme: usernameEasterEggTheme,
    voiceLocale: (username) =>
      usernameEasterEggVoiceLocale(
        username === undefined
          ? undefined
          : matchingUsernameEasterEggCharacter(username),
      ),
  });
}

globalThis.aceAttorneyCourtroomNameChange = Object.freeze({
  create: createCourtroomNameChange,
});
