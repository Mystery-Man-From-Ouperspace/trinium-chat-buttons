import { TriniumLogger } from './logger.js';
import { SETTINGS, DEFAULT_SUBSCREEN } from './settings.js';

export class Draggable {
  constructor(element, handle) {
    this.element = element;
    this.handle = handle || element;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.startLeft = 0;
    this.startTop = 0;

    this.bindEvents();
  }

  bindEvents() {
    this.handle.style.cursor = 'move';
    this.handle.addEventListener('mousedown', this.startDragging.bind(this));
    document.addEventListener('mousemove', this.drag.bind(this));
    document.addEventListener('mouseup', this.stopDragging.bind(this));
  }

  startDragging(e) {
    if (e.button !== 0) return; // Only react to left mouse button
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startLeft = parseInt(window.getComputedStyle(this.element).left, 10);
    this.startTop = parseInt(window.getComputedStyle(this.element).top, 10);
    e.preventDefault();
  }

  drag(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    this.element.style.left = `${this.startLeft + dx}px`;
    this.element.style.top = `${this.startTop + dy}px`;
  }

  stopDragging() {
    this.isDragging = false;
  }
}

// Define constants for CSS selectors
const CSS = {
  GM_SCREEN: '#tcb-gm-screen',
  GM_SCREEN_BUTTON: '#chat-controls .tcb-gm-screen-button',
  TAB_BUTTON: '.tcb-tab-button',
  EDIT_BUTTON: '.tcb-edit-button',
  SETTINGS_BUTTON: '.tcb-settings-button',
  EDITOR: '#tcb-gm-screen-editor',
  EDITOR_TEXTAREA: '#tcb-editor-textarea',
  EDITOR_PREVIEW: '.tcb-editor-preview',
  EDITOR_SAVE: '#tcb-editor-save',
  EDITOR_SAVE_CLOSE: '#tcb-editor-save-close',
  EDITOR_CANCEL: '#tcb-editor-cancel',
  EDITOR_RESTORE: '#tcb-editor-restore',
  SETTINGS_FORM: '#tcb-gm-screen-settings-form',
  SAVE_SETTINGS: '.tcb-close-settings',
  SAVE_CLOSE_SETTINGS: '.tcb-close-settings',
  CLOSE_SETTINGS: '.tcb-close-settings',
  TAB_BUTTON: '.tcb-tab-button',
};

class GMScreen {
  static logger;

  static init() {
    this.logger = new TriniumLogger(SETTINGS.MODULE_NAME);
    this.logger.info('Initializing GM Screen');
    this.initializeEventListeners();
  }

  static initializeEventListeners() {
    this.logger.info('Initializing event listeners');

    // GM Screen toggle
    $(document).on('click.tcb-gm-screen', CSS.GM_SCREEN_BUTTON, this.toggleGMScreen.bind(this));

    // Tab switching
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} ${CSS.TAB_BUTTON}`, this.handleTabClick.bind(this));

    // Edit button
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} ${CSS.EDIT_BUTTON}`, this.openEditor.bind(this));

    // Settings button
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} ${CSS.SETTINGS_BUTTON}`, this.openSettings.bind(this));

    // Tab container
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} .tcb-tab-toggle`, this.toggleTabContainer.bind(this));

    // Editor events
    $(document).on('input', CSS.EDITOR_TEXTAREA, this.debounce(this.updateEditorPreview.bind(this), 300));
    $(document).on('click', CSS.EDITOR_SAVE, () => this.saveEditor(false));
    $(document).on('click', CSS.EDITOR_SAVE_CLOSE, () => this.saveEditor(true));
    $(document).on('click', CSS.EDITOR_CANCEL, this.closeEditor.bind(this));
    $(document).on('click', CSS.EDITOR_RESTORE, this.restoreDefaultContent.bind(this));
    $(document).on('click', '#tcb-gm-screen-editor .tcb-editor-tab-button', this.handleEditorTabClick.bind(this));

    // Settings panel event listeners
    $(document).on('submit', '#tcb-gm-screen-settings-form', async (e) => {
      e.preventDefault();
      if (this.validateSettingsForm(e.target)) {
        await this.saveSettings(e);
        $('#tcb-gm-screen-settings').remove();
      }
    });

    $(document).on('click', '#tcb-save-settings', async (e) => {
      e.preventDefault();
      if (this.validateSettingsForm(e.target.form)) {
        await this.saveSettings(e);
      }
    });

    $(document).on('click', '.tcb-close-settings', () => {
      $('#tcb-gm-screen-settings').remove();
    });

    // Foundry hooks
    Hooks.on('renderChatLog', this.initializeGMScreenButton.bind(this));
    Hooks.on('updateSetting', this.refreshGMScreen.bind(this));
  }

  static initializeGMScreenButton(chatLog, html) {
    if (!game.user.isGM) return;

    const chatControls = html.find('#chat-controls');
    if (!chatControls.length) {
      this.logger.error('No chat controls found');
      return;
    }

    const gmScreenBtn = $(`<a class="tcb-gm-screen-button" title="${game.i18n.localize('TRINIUMCB.ToggleGMScreen')}">
      <i class="fas fa-book-open"></i>
    </a>`);

    chatControls.prepend(gmScreenBtn);
  }

  static createGMScreen() {
    this.logger.debug('Creating GM Screen');
    const numberOfSubscreens = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.NUMBER_OF_SUBSCREENS);
    const mode = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_MODE);
    const gmScreenHeight = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_HEIGHT);
    const leftMargin = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LEFT_MARGIN);
    const rightMargin = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_RIGHT_MARGIN);
    const expandBottomMode = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.EXPAND_BOTTOM_MODE);

    let gmScreenHtml = `<div id="tcb-gm-screen" class="tcb-app tcb-${mode}-mode" style="--gm-screen-height: ${gmScreenHeight}%; --number-of-subscreens: ${numberOfSubscreens}; --left-margin: ${leftMargin}px; --right-margin: ${rightMargin}px; --expand-bottom-mode: ${
      expandBottomMode ? 'true' : 'false'
    };">`;

    const layout = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LAYOUT);

    for (let i = 1; i <= numberOfSubscreens; i++) {
      const subscreen = layout[i] || DEFAULT_SUBSCREEN;
      gmScreenHtml += this.createSubscreenHTML(i, subscreen);
    }

    gmScreenHtml += '</div>';

    $('#interface').append($(gmScreenHtml));

    // Initialize content for all subscreens
    for (let i = 1; i <= numberOfSubscreens; i++) {
      const subscreen = layout[i] || DEFAULT_SUBSCREEN;
      for (let row = 1; row <= subscreen.rows; row++) {
        const defaultTab = this.getDefaultTab(i, row);
        this.switchTab(defaultTab, i, row);
      }
    }

    // Apply width to subscreens
    Object.entries(layout).forEach(([index, subscreen]) => {
      if (subscreen.width) {
        $(`#tcb-gm-screen .tcb-subscreen[data-subscreen="${index}"]`).css('width', `${subscreen.width}px`);
      }
    });
  }

  static createSubscreenHTML(subscreenIndex, subscreen) {
    let html = `<div class="tcb-subscreen" data-subscreen="${subscreenIndex}" data-width="${
      subscreen.width
    }" style="width: ${subscreen.width ? subscreen.width + 'px' : 'auto'}">`;

    for (let row = 1; row <= subscreen.rows; row++) {
      html += `
        <div class="tcb-subscreen-row" data-row="${row}">
          <header class="tcb-window-header">
            <div class="tcb-gm-screen-controls">
              ${
                subscreenIndex === 1 && row === 1
                  ? `
                <button class="tcb-settings-button"><i class="fas fa-cog"></i></button>
              `
                  : ''
              }
              <button class="tcb-tab-toggle"><i class="fas fa-chevron-down"></i></button>
              <button class="tcb-edit-button">Edit Tab #1 <i class="fas fa-edit"></i></button>
            </div>
          </header>
          <div class="tcb-tab-container" style="display: none; position: absolute; width: 100%; z-index: 100;">
            <div class="tcb-tab-row">
              ${Array.from({ length: 5 }, (_, i) => i + 1)
                .map((tab) => `<button class="tcb-tab-button" data-tab="${tab}">${tab}</button>`)
                .join('')}
            </div>
            <div class="tcb-tab-row">
              ${Array.from({ length: 5 }, (_, i) => i + 6)
                .map((tab) => `<button class="tcb-tab-button" data-tab="${tab}">${tab}</button>`)
                .join('')}
            </div>
          </div>
          <section class="tcb-window-content"></section>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  static toggleTabContainer(event) {
    const $button = $(event.currentTarget);
    const $row = $button.closest('.tcb-subscreen-row');
    const $tabContainer = $row.find('.tcb-tab-container');
    
    if ($tabContainer.is(':visible')) {
      $tabContainer.slideUp(100, () => {
        $tabContainer.css('display', 'none');
      });
    } else {
      $tabContainer.css('display', 'block').hide().slideDown(100);
    }
    $button.find('i').toggleClass('fa-chevron-down fa-chevron-up');
  }

  static toggleGMScreen() {
    this.logger.debug('Toggling GM Screen');
    let gmScreen = $(CSS.GM_SCREEN);
    if (gmScreen.length) {
      gmScreen.toggleClass('tcb-visible');
    } else {
      this.createGMScreen();
      gmScreen = $(CSS.GM_SCREEN);
      // Force a reflow before adding the visible class
      void gmScreen[0].offsetWidth;
      gmScreen.addClass('tcb-visible');
    }
  }

  static refreshGMScreen(setting, data) {
    this.logger.debug('Refreshing GM Screen');
    const gmScreen = $(CSS.GM_SCREEN);
    const wasVisible = gmScreen.hasClass('tcb-visible');
    gmScreen.remove();
    if (wasVisible) {
      this.createGMScreen();
      $(CSS.GM_SCREEN).addClass('tcb-visible');
    }
  }

  static handleTabClick(event) {
    const $button = $(event.currentTarget);
    const tab = $button.data('tab');
    const $subscreen = $button.closest('.tcb-subscreen');
    const subscreenIndex = $subscreen.data('subscreen');
    const $row = $button.closest('.tcb-subscreen-row');
    const rowIndex = $row.data('row');
    
    this.switchTab(tab, subscreenIndex, rowIndex);
    this.setDefaultTab(subscreenIndex, rowIndex, tab);
    
    // Update active state in the tab container
    $row.find('.tcb-tab-button').removeClass('tcb-active');
    $button.addClass('tcb-active');
  
    // Update edit button text
    $row.find('.tcb-edit-button').html(`Edit Tab #${tab} <i class="fas fa-edit"></i>`);
  
    // Slide up the tab container
    $row.find('.tcb-tab-container').slideUp(100, () => {
      $row.find('.tcb-tab-container').css('display', 'none');
    });
    $row.find('.tcb-tab-toggle i').removeClass('fa-chevron-up').addClass('fa-chevron-down');
  }

  static async setDefaultTab(subscreenIndex, rowIndex, tab) {
    const defaultTabs = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_DEFAULT_TABS);
    if (!defaultTabs[subscreenIndex]) defaultTabs[subscreenIndex] = {};
    defaultTabs[subscreenIndex][rowIndex] = tab;
    await game.settings.set(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_DEFAULT_TABS, defaultTabs);
  }

  static getDefaultTab(subscreenIndex, rowIndex) {
    const defaultTabs = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_DEFAULT_TABS);
    return defaultTabs[subscreenIndex]?.[rowIndex] || 1;
  }

  static switchTab(tab, subscreenIndex, rowIndex) {
    this.logger.debug(`Switching to tab ${tab} in subscreen ${subscreenIndex}, row ${rowIndex}`);
    const content = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${tab}`);
    const renderedContent = window.marked.parse(content);
    $(
      `${CSS.GM_SCREEN} .tcb-subscreen[data-subscreen="${subscreenIndex}"] .tcb-subscreen-row[data-row="${rowIndex}"] .tcb-window-content`
    ).html(renderedContent);

    // Update active state in the tab container
    const $row = $(
      `${CSS.GM_SCREEN} .tcb-subscreen[data-subscreen="${subscreenIndex}"] .tcb-subscreen-row[data-row="${rowIndex}"]`
    );
    $row.find('.tcb-tab-button').removeClass('tcb-active');
    $row.find(`.tcb-tab-button[data-tab="${tab}"]`).addClass('tcb-active');
  }

  static openEditor(event) {
    const $button = $(event.currentTarget);
    const $subscreen = $button.closest('.tcb-subscreen');
    const subscreenIndex = $subscreen.data('subscreen');
    const $row = $button.closest('.tcb-subscreen-row');
    const rowIndex = $row.data('row');
    const activeTab = $row.find(`${CSS.TAB_BUTTON}.tcb-active`).data('tab');

    const content = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${activeTab}`);

    const rowHeight = $row.height();
    const rowWidth = $row.width();

    const editorHtml = `
      <div id="tcb-gm-screen-editor" class="tcb-app">
        <div class="tcb-editor-preview" style="width: ${rowWidth}px; position: relative;">
          <div class="tcb-editor-preview-content"></div>
          <div class="tcb-editor-preview-line" style="position: absolute; top: ${rowHeight}px; left: 0; right: 0;"></div>
        </div>
        <div class="tcb-editor-input">
          <div class="tcb-editor-header">
            <div class="tcb-editor-header-text">
          Note: The size of the preview tab is currently set to the size of Subscreen ${subscreenIndex}, Row ${rowIndex}. Select tab to edit:
            </div>
          <div class="tcb-editor-tabs">
        ${Array.from({ length: 10 }, (_, i) => i + 1)
          .map(
            (tab) =>
              `<button class="tcb-editor-tab-button ${
                tab === activeTab ? 'tcb-active' : ''
              }" data-tab="${tab}">${tab}</button>`
          )
          .join('')}
      </div>
          </div>
          <textarea id="tcb-editor-textarea">${content}</textarea>
          <div class="tcb-editor-buttons">
            <button id="tcb-editor-save-close">${game.i18n.localize('TRINIUMCB.SaveAndClose')}</button>
            <button id="tcb-editor-save">${game.i18n.localize('TRINIUMCB.Save')}</button>
            <button id="tcb-editor-restore">${game.i18n.localize('TRINIUMCB.RestoreDefault')}</button>
            <button id="tcb-editor-cancel">${game.i18n.localize('TRINIUMCB.Cancel')}</button>
          </div>
        </div>
      </div>
    `;

    $('body').append(editorHtml);

    this.updateEditorPreview();
  }

  static async handleEditorTabClick(event) {
    const $button = $(event.currentTarget);
    const newTab = $button.data('tab');
    const $activeTab = $('#tcb-gm-screen-editor .tcb-editor-tab-button.tcb-active');
    const currentTab = $activeTab.data('tab');

    if (newTab === currentTab) return;

    const currentContent = $(CSS.EDITOR_TEXTAREA).val();
    const savedContent = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${currentTab}`);

    if (currentContent !== savedContent) {
      // Create the confirmation dialog HTML
      const confirmationHtml = `
        <div class="tcb-editor-confirmation-dialog">
          <p>${game.i18n.localize('TRINIUMCB.UnsavedChangesConfirmation')}</p>
          <div class="button-container">
            <button class="confirm-yes">${game.i18n.localize('Yes')}</button>
            <button class="confirm-no">${game.i18n.localize('No')}</button>
          </div>
        </div>
      `;

      // Append the confirmation dialog to the editor
      $('#tcb-gm-screen-editor').prepend(confirmationHtml);
      const $dialog = $('.tcb-editor-confirmation-dialog');

      // Show the dialog
      $dialog.show();

      return new Promise((resolve) => {
        const confirmYesHandler = () => {
          cleanup();
          resolve(true);
        };
        const confirmNoHandler = () => {
          cleanup();
          resolve(false);
        };

        const cleanup = () => {
          $dialog.find('.confirm-yes').off('click', confirmYesHandler);
          $dialog.find('.confirm-no').off('click', confirmNoHandler);
          $dialog.remove();
        };

        $dialog.find('.confirm-yes').on('click', confirmYesHandler);
        $dialog.find('.confirm-no').on('click', confirmNoHandler);
      }).then((confirmation) => {
        if (!confirmation) return;

        $activeTab.removeClass('tcb-active');
        $button.addClass('tcb-active');

        const newContent = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${newTab}`);
        $(CSS.EDITOR_TEXTAREA).val(newContent);
        this.updateEditorPreview();
      });
    } else {
      $activeTab.removeClass('tcb-active');
      $button.addClass('tcb-active');

      const newContent = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${newTab}`);
      $(CSS.EDITOR_TEXTAREA).val(newContent);
      this.updateEditorPreview();
    }
  }

  // Update the updateEditorPreview method
  static updateEditorPreview() {
    const content = $(CSS.EDITOR_TEXTAREA).val();
    const renderedContent = window.marked.parse(content);
    $(`${CSS.EDITOR} .tcb-editor-preview-content`).html(renderedContent);
  }

  static async saveEditor(close) {
    this.logger.debug('Saving editor content');
    const content = $(CSS.EDITOR_TEXTAREA).val();
    const activeTab = $(`${CSS.GM_SCREEN} ${CSS.TAB_BUTTON}.tcb-active`).data('tab');
    await game.settings.set(SETTINGS.MODULE_NAME, `gmScreenContent_tab${activeTab}`, content);
    this.switchTab(activeTab, 1); // Assuming we're always editing the first subscreen
    if (close) {
      this.closeEditor();
    }
  }

  static closeEditor() {
    $(CSS.EDITOR).remove();
  }

  static restoreDefaultContent() {
    this.logger.debug('Restoring default content');
    const activeTab = $(`${CSS.GM_SCREEN} ${CSS.TAB_BUTTON}.tcb-active`).data('tab');
    const defaultContent = game.settings.settings.get(
      `${SETTINGS.MODULE_NAME}.gmScreenContent_tab${activeTab}`
    ).default;
    $(CSS.EDITOR_TEXTAREA).val(defaultContent);
    this.updateEditorPreview();
  }

  static openSettings() {
    this.logger.debug('Opening GM Screen settings');
    const layout = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LAYOUT);

    const settingsHtml = `
      <div id="tcb-gm-screen-settings">
        <header class="tcb-window-header">
          <h2>${game.i18n.localize('TRINIUMCB.GMScreenSettings')}</h2>
          <button class="tcb-close-settings">&times;</button>
        </header>
        <div class="tcb-window-content">
          <form id="tcb-gm-screen-settings-form">
            <div class="tcb-settings-scrollable">
              ${this.generateGeneralSettingsFields()}
              <hr>
              <h3>${game.i18n.localize('TRINIUMCB.SubscreenSettings')}</h3>
              ${[1, 2, 3, 4]
                .map(
                  (i) => `
                <fieldset>
                  <legend>${game.i18n.localize('TRINIUMCB.Subscreen')} ${i}</legend>
                  <div class="form-group">
                    <label for="tcb-subscreen-rows-${i}">${game.i18n.localize('TRINIUMCB.NumberOfRows')}</label>
                    <input type="number" id="tcb-subscreen-rows-${i}" name="subscreen[${i}].rows" value="${
                    layout[i]?.rows || 1
                  }" min="1" max="3" required>
                  </div>
                  <div class="form-group">
                    <label for="tcb-subscreen-width-${i}">${game.i18n.localize('TRINIUMCB.SubscreenWidth')}</label>
                    <input type="number" id="tcb-subscreen-width-${i}" name="subscreen[${i}].width" value="${
                    layout[i]?.width || 0
                  }" min="0" max="1000" step="10" required>
                  </div>
                </fieldset>
              `
                )
                .join('')}
            </div>
            <div class="tcb-settings-buttons">
              <button type="submit" id="tcb-save-close-settings">${game.i18n.localize(
                'TRINIUMCB.SaveAndClose'
              )}</button>
              <button type="button" id="tcb-save-settings">${game.i18n.localize('TRINIUMCB.Save')}</button>
              <button type="button" class="tcb-close-settings">${game.i18n.localize('TRINIUMCB.Cancel')}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const $settingsPanel = $(settingsHtml);
    $('body').append($settingsPanel);

    this.initializeDraggableSettings($settingsPanel[0]);
  }

  static validateSettingsForm(form) {
    if (form.checkValidity()) {
      return true;
    } else {
      form.reportValidity();
      return false;
    }
  }

  static validateSettingsForm(form) {
    if (form.checkValidity()) {
      return true;
    } else {
      form.reportValidity();
      return false;
    }
  }

  static initializeDraggableSettings(settingsPanel) {
    const header = settingsPanel.querySelector('.tcb-window-header');
    new Draggable(settingsPanel, header);
  }

  static generateGeneralSettingsFields() {
    const settings = [
      {
        key: SETTINGS.NUMBER_OF_SUBSCREENS,
        type: 'number',
        label: 'TRINIUMCB.NumberOfSubscreens',
        hint: 'TRINIUMCB.NumberOfSubscreensHint',
        min: 1,
        max: 4,
        step: 1,
      },
      {
        key: SETTINGS.GM_SCREEN_MODE,
        type: 'select',
        label: 'TRINIUMCB.GMScreenMode',
        hint: 'TRINIUMCB.GMScreenModeHint',
        options: ['right-side', 'left-side', 'bottom'],
      },
      {
        key: SETTINGS.SUBSCREEN_WIDTH,
        type: 'number',
        label: 'TRINIUMCB.SubscreenWidth',
        hint: 'TRINIUMCB.SubscreenWidthHint',
        min: 100,
        max: 1000,
        step: 10,
      },
      {
        key: SETTINGS.GM_SCREEN_HEIGHT,
        type: 'number',
        label: 'TRINIUMCB.GMScreenHeight',
        hint: 'TRINIUMCB.GMScreenHeightHint',
        min: 10,
        max: 100,
        step: 5,
      },
      {
        key: SETTINGS.GM_SCREEN_LEFT_MARGIN,
        type: 'number',
        label: 'TRINIUMCB.GMScreenLeftMargin',
        hint: 'TRINIUMCB.GMScreenLeftMarginHint',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: SETTINGS.GM_SCREEN_RIGHT_MARGIN,
        type: 'number',
        label: 'TRINIUMCB.GMScreenRightMargin',
        hint: 'TRINIUMCB.GMScreenRightMarginHint',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: SETTINGS.EXPAND_BOTTOM_MODE,
        type: 'checkbox',
        label: 'TRINIUMCB.ExpandBottomMode',
        hint: 'TRINIUMCB.ExpandBottomModeHint',
      },
    ];

    return settings
      .map((setting) => {
        const value = game.settings.get(SETTINGS.MODULE_NAME, setting.key);
        let inputHtml;

        if (setting.type === 'select') {
          inputHtml = `
          <select id="${setting.key}" name="${setting.key}" required>
            ${setting.options
              .map(
                (option) =>
                  `<option value="${option}" ${value === option ? 'selected' : ''}>${game.i18n.localize(
                    `TRINIUMCB.${option}`
                  )}</option>`
              )
              .join('')}
          </select>
        `;
        } else if (setting.type === 'checkbox') {
          inputHtml = `
          <input type="checkbox" id="${setting.key}" name="${setting.key}" ${value ? 'checked' : ''}>
        `;
        } else {
          inputHtml = `
          <input type="${setting.type}" id="${setting.key}" name="${setting.key}" value="${value}"
                 min="${setting.min}" max="${setting.max}" step="${setting.step}" required>
        `;
        }

        return `
        <div class="form-group">
          <label for="${setting.key}">${game.i18n.localize(setting.label)}</label>
          ${inputHtml}
          <p class="notes">${game.i18n.localize(setting.hint)}</p>
        </div>
      `;
      })
      .join('');
  }

  static validateSetting(settingKey, value) {
    const setting = game.settings.settings.get(`${SETTINGS.MODULE_NAME}.${settingKey}`);
    if (setting.type === Number) {
      const min = setting.range?.min ?? Number.MIN_SAFE_INTEGER;
      const max = setting.range?.max ?? Number.MAX_SAFE_INTEGER;
      return Math.clamped(Number(value), min, max);
    }
    return value;
  }

  static async saveSettings(event) {
    event.preventDefault();
    this.logger.debug('Saving GM Screen settings');

    const form = document.getElementById('tcb-gm-screen-settings-form');
    const formData = new FormData(form);

    // Save general settings
    for (let [key, value] of formData.entries()) {
      if (!key.startsWith('subscreen')) {
        if (key === SETTINGS.EXPAND_BOTTOM_MODE) {
          value = value === 'on';
        } else if (key !== SETTINGS.GM_SCREEN_MODE) {
          value = Number(value);
        }
        await game.settings.set(SETTINGS.MODULE_NAME, key, value);
      }
    }

    // Save layout settings
    const newLayout = {};
    for (let [key, value] of formData.entries()) {
      if (key.startsWith('subscreen')) {
        const match = key.match(/subscreen\[(\d+)\]\.(\w+)/);
        if (match) {
          const [, subscreenIndex, property] = match;
          newLayout[subscreenIndex] = newLayout[subscreenIndex] || {};
          newLayout[subscreenIndex][property] = parseInt(value);
        }
      }
    }
    await game.settings.set(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LAYOUT, newLayout);

    this.refreshGMScreen();
    ui.notifications.info(game.i18n.localize('TRINIUMCB.SettingsSaved'));

    return newLayout;
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

export function init() {
  GMScreen.init();
}
