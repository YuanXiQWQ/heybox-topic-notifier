/**
 * @file 本文件提供注册与修改用户名或显示名称时触发的《逆转裁判》主题彩蛋。
 */

/**
 * 彩蛋角色、资源目录与可识别姓名。
 */
const usernameEasterEggCharacters = [
  {
    key: "phoenixWright",
    theme: "trilogy",
    type: "type1",
    names: [
      ["Phoenix", "Wright"],
      ["成歩堂", "龍一"],
      ["成步堂", "龙一"],
    ],
  },
  {
    key: "apolloJustice",
    theme: "aa456",
    type: "type2",
    names: [
      ["Apollo", "Justice"],
      ["王泥喜", "法介"],
    ],
  },
  {
    key: "athenaCykes",
    theme: "aa456",
    type: "type3",
    names: [
      ["Athena", "Cykes"],
      ["希月", "心音"],
    ],
  },
  {
    key: "milesEdgeworth",
    theme: "investigations",
    type: "type4",
    names: [
      ["Miles", "Edgeworth"],
      ["御剣", "怜侍"],
      ["御剑", "怜侍"],
    ],
  },
  {
    key: "miaFey",
    theme: "trilogy",
    type: "type5",
    names: [
      ["Mia", "Fey"],
      ["綾里", "千尋"],
      ["绫里", "千寻"],
    ],
  },
];

/**
 * 彩蛋交互文案。
 */
const usernameEasterEggMessages = {
  en: {
    alt: "Ace Attorney exclamation",
    confirmDisplayName: "Are you sure you want to change the display name to",
    confirmUsername: "Are you sure you want to change the username to",
    yes: "Yes",
    no: "No",
    question:
      "Hold it! Is this your real name, or are you just trying to make me more famous?",
    realName: "My real name",
    forFun: "Just for fun",
    finish: "Anyway, take that! Save your changes.",
    continue: "Continue",
  },
  ja: {
    alt: "逆転裁判の掛け声",
    confirmDisplayName: "表示名を次の名前に変更しますか：",
    confirmUsername: "ユーザー名を次の名前に変更しますか：",
    yes: "はい",
    no: "いいえ",
    question:
      "待った！これは本名ですか？それとも私をもっと有名にしたいだけですか？",
    realName: "本名です",
    forFun: "遊びです",
    finish: "とにかく、くらえ！変更を保存しましょう。",
    continue: "続ける",
  },
  zh: {
    alt: "逆转裁判台词画面",
    confirmDisplayName: "确定要把显示名称改为",
    confirmUsername: "确定要把用户名改为",
    yes: "是",
    no: "否",
    question: "且慢！这是你的真名，还是只是想让我更出名？",
    realName: "这是真名",
    forFun: "只是玩玩",
    finish: "不管怎样，接招吧！保存你的修改。",
    continue: "继续",
  },
};

/**
 * 当前正在播放的彩蛋音频。
 */
const usernameEasterEggAudios = new Set();

/**
 * 已经完成彩蛋、允许继续提交的注册表单。
 */
const usernameEasterEggApprovedRegistrationForms = new WeakSet();

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
 * 根据页面语言选择彩蛋语音资源语言。
 *
 * @return {"en"|"jp"|"zh"} 彩蛋资源语言目录。
 */
function usernameEasterEggVoiceLocale() {
  const locale = document.documentElement.lang.toLocaleLowerCase("en-US");
  if (locale.startsWith("zh")) {
    return "zh";
  }
  if (locale.startsWith("ja")) {
    return "jp";
  }
  return "en";
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
 * 获取当前页面语言对应的彩蛋交互文案。
 *
 * @return {typeof usernameEasterEggMessages.en} 彩蛋交互文案。
 */
function currentUsernameEasterEggMessages() {
  const locale = document.documentElement.lang.toLocaleLowerCase("en-US");
  if (locale.startsWith("zh")) {
    return usernameEasterEggMessages.zh;
  }
  if (locale.startsWith("ja")) {
    return usernameEasterEggMessages.ja;
  }
  return usernameEasterEggMessages.en;
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
    const voiceLocale = usernameEasterEggVoiceLocale();
    const imageLocale = usernameEasterEggImageLocale();
    const messages = currentUsernameEasterEggMessages();
    const assetRoot = "/static/easter-egg/ace-attorney/assets";
    const prefersReducedMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches ?? false;
    const overlay = document.createElement("div");
    const image = document.createElement("img");
    const panel = document.createElement("section");
    const speaker = document.createElement("span");
    const message = document.createElement("p");
    const continueButton = document.createElement("button");
    const actions = document.createElement("div");
    let backgroundAudio;
    let choiceLocked = false;
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
    image.alt = messages.alt;
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
      return `${assetRoot}/sounds/${character.type}/${character.key}/${voiceLocale}/${cue}.mp3`;
    }

    /**
     * 生成当前角色的背景音乐资源地址。
     *
     * @param {"msc-objection"|"msc-pressingPursuit"} track 音乐资源名。
     * @return {string} 背景音乐资源地址。
     */
    function musicSource(track) {
      const englishPhoenixDirectory = voiceLocale === "en" &&
          character.type === "type1"
        ? "/en"
        : "";
      return `${assetRoot}/sounds/${character.type}${englishPhoenixDirectory}/${track}.mp3`;
    }

    /**
     * 生成通用彩蛋音效资源地址。
     *
     * @param {"sfx-blipmale"|"sfx-gavel"|"sfx-pichoop"|"sfx-selectblip2"|"sfx-whoops"} effect 音效名。
     * @return {string} 通用音效资源地址。
     */
    function soundEffectSource(effect) {
      return `${assetRoot}/sounds/general/${effect}.wav`;
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
      image.src = `${assetRoot}/images/${imageLocale}/${cue}.png`;
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

      let finalized = false;

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

/**
 * 判断表单提交控件能否传给 requestSubmit。
 *
 * @param {EventTarget|null} submitter 表单提交事件的触发控件。
 * @return {submitter is HTMLButtonElement|HTMLInputElement} 控件可用于提交时返回 true。
 */
function isUsernameEasterEggSubmitter(submitter) {
  return submitter instanceof HTMLButtonElement ||
    submitter instanceof HTMLInputElement &&
      ["submit", "image"].includes(submitter.type);
}

/**
 * 拦截注册表单提交并在命中角色姓名时播放彩蛋。
 *
 * @param {SubmitEvent} event 注册表单提交事件。
 */
function handleUsernameEasterEggRegistration(event) {
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  if (usernameEasterEggApprovedRegistrationForms.has(form)) {
    usernameEasterEggApprovedRegistrationForms.delete(form);
    return;
  }

  const usernameInput = form.elements.namedItem("username");
  const displayNameInput = form.elements.namedItem("displayName");
  const matchingInput = [displayNameInput, usernameInput].find((input) =>
    input instanceof HTMLInputElement &&
    matchesUsernameEasterEgg(input.value)
  );
  if (!(matchingInput instanceof HTMLInputElement)) {
    return;
  }

  event.preventDefault();
  const submitter = event.submitter;
  void activateUsernameEasterEgg(
    matchingInput.value,
    matchingInput === displayNameInput ? "displayName" : "username",
  ).then((approved) => {
    if (!approved) {
      matchingInput.value = "";
      matchingInput.focus();
      return;
    }

    usernameEasterEggApprovedRegistrationForms.add(form);
    if (isUsernameEasterEggSubmitter(submitter)) {
      form.requestSubmit(submitter);
    } else {
      form.requestSubmit();
    }
  });
}

/**
 * 为页面中的注册表单绑定用户名彩蛋。
 */
function initUsernameEasterEggRegistration() {
  document.querySelectorAll("[data-username-easter-egg-register]").forEach(
    (form) => {
      if (form instanceof HTMLFormElement) {
        form.addEventListener("submit", handleUsernameEasterEggRegistration);
      }
    },
  );
}

globalThis.usernameEasterEgg = Object.freeze({
  activate: activateUsernameEasterEgg,
  imageLocale: usernameEasterEggImageLocale,
  matches: matchesUsernameEasterEgg,
  theme: usernameEasterEggTheme,
  voiceLocale: usernameEasterEggVoiceLocale,
});

initUsernameEasterEggRegistration();
