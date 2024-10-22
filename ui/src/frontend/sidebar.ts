// Copyright (C) 2018 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import m from 'mithril';
import {assertExists} from '../base/logging';
import {isString} from '../base/object_utils';
import {getCurrentChannel} from '../core/channels';
import {ConversionJobStatus} from '../common/conversion_jobs';
import {
  isMetatracingEnabled,
} from '../core/metatracing';
import {EngineMode} from '../trace_processor/engine';
import {featureFlags} from '../core/feature_flags';
import {raf} from '../core/raf_scheduler';
import {SCM_REVISION, VERSION} from '../gen/perfetto_version';
import {showModal} from '../widgets/modal';
import {Animation} from './animation';
import {globals} from './globals';
import {toggleHelp} from './help_modal';
import {
  createTraceLink,
  isDownloadable,
  isTraceLoaded,
  shareTrace,
} from './trace_attrs';
import {formatHotkey} from '../base/hotkeys';
import {SidebarMenuItem} from '../public/sidebar';
import {AppImpl} from '../core/app_impl';
import {Trace} from '../public/trace';
import {Router} from '../core/router';

const GITILES_URL =
  'https://android.googlesource.com/platform/external/perfetto';

function getBugReportUrl(): string {
  return 'https://github.com/janestreet/perfetto/issues/new';
}

const HIRING_BANNER_FLAG = featureFlags.register({
  id: 'showHiringBanner',
  name: 'Show hiring banner',
  description: 'Show the "We\'re hiring" banner link in the side bar.',
  defaultValue: false,
});

const WIDGETS_PAGE_IN_NAV_FLAG = featureFlags.register({
  id: 'showWidgetsPageInNav',
  name: 'Show widgets page',
  description: 'Show a link to the widgets page in the side bar.',
  defaultValue: false,
});

const PLUGINS_PAGE_IN_NAV_FLAG = featureFlags.register({
  id: 'showPluginsPageInNav',
  name: 'Show plugins page',
  description: 'Show a link to the plugins page in the side bar.',
  defaultValue: false,
});

export interface OptionalTraceAttrs {
  trace?: Trace;
}

function shouldShowHiringBanner(): boolean {
  return globals.isInternalUser && HIRING_BANNER_FLAG.get();
}

interface SectionItem {
  t: string;
  a: string | ((e: Event) => void);
  i: string;
  title?: string;
  isPending?: () => boolean;
  isVisible?: () => boolean;
  internalUserOnly?: boolean;
  checkDownloadDisabled?: boolean;
  checkMetatracingEnabled?: boolean;
  checkMetatracingDisabled?: boolean;
}

interface Section {
  title: string;
  summary: string;
  items: SectionItem[];
  expanded?: boolean;
  hideIfNoTraceLoaded?: boolean;
  appendOpenedTraceTitle?: boolean;
}

function insertSidebarMenuitems(
  groupSelector: SidebarMenuItem['group'],
): ReadonlyArray<SectionItem> {
  return AppImpl.instance.sidebar.menuItems
    .valuesAsArray()
    .filter(({group}) => group === groupSelector)
    .sort((a, b) => {
      const prioA = a.priority ?? 0;
      const prioB = b.priority ?? 0;
      return prioA - prioB;
    })
    .map((item) => {
      const cmd = globals.commandManager.getCommand(item.commandId);
      const title = cmd.defaultHotkey
        ? `${cmd.name} [${formatHotkey(cmd.defaultHotkey)}]`
        : cmd.name;
      return {
        t: cmd.name,
        a: (e: Event) => {
          e.preventDefault();
          cmd.callback();
        },
        i: item.icon,
        title,
      };
    });
}

function getSections(_?: Trace): Section[] {
  return [
    {
      title: 'Navigation',
      summary: 'Open or record a new trace',
      expanded: true,
      items: [
        ...insertSidebarMenuitems('navigation'),
        {
          t: 'Widgets',
          a: navigateWidgets,
          i: 'widgets',
          isVisible: () => WIDGETS_PAGE_IN_NAV_FLAG.get(),
        },
        {
          t: 'Plugins',
          a: navigatePlugins,
          i: 'extension',
          isVisible: () => PLUGINS_PAGE_IN_NAV_FLAG.get(),
        },
      ],
    },

    {
      title: 'Current Trace',
      summary: 'Actions on the current trace',
      expanded: true,
      hideIfNoTraceLoaded: true,
      appendOpenedTraceTitle: true,
      items: [
        {t: 'Show timeline', a: navigateViewer, i: 'line_style'},
        {
          t: 'Share',
          a: handleShareTrace,
          i: 'share',
          internalUserOnly: true,
          isPending: () =>
            globals.getConversionJobStatus('create_permalink') ===
            ConversionJobStatus.InProgress,
        },
        {t: 'Query (SQL)', a: navigateQuery, i: 'database'},
      ],
    },

    {
      title: 'Example Traces',
      expanded: true,
      summary: 'Open an example trace',
      items: [...insertSidebarMenuitems('example_traces')],
    },

    {
      title: 'Support',
      expanded: true,
      summary: 'Documentation & Bugs',
      items: [
        {t: 'Keyboard shortcuts', a: openHelp, i: 'help'},
        {t: 'Documentation', a: 'https://github.com/janestreet/magic-trace', i: 'find_in_page'},
        {
          t: 'Report a bug',
          a: getBugReportUrl(),
          i: 'bug_report',
        },
        {
          t: 'About',
          a: 'https://github.com/janestreet/magic-trace/wiki/About-the-UI',
          i: 'info'
        },
      ],
    },
  ];
}

function openHelp(e: Event) {
  e.preventDefault();
  toggleHelp();
}

function downloadTraceFromUrl(url: string): Promise<File> {
  return m.request({
    method: 'GET',
    url,
    // TODO(hjd): Once mithril is updated we can use responseType here rather
    // than using config and remove the extract below.
    config: (xhr) => {
      xhr.responseType = 'blob';
      xhr.onprogress = (progress) => {
        const percent = ((100 * progress.loaded) / progress.total).toFixed(1);
        const msg = `Downloading trace ${percent}%`;
        AppImpl.instance.omnibox.showStatusMessage(msg);
      };
    },
    extract: (xhr) => {
      return xhr.response;
    },
  });
}

export async function getCurrentTrace(): Promise<Blob> {
  // Caller must check engine exists.
  const src = assertExists(AppImpl.instance.trace?.traceInfo.source);
  if (src.type === 'ARRAY_BUFFER') {
    return new Blob([src.buffer]);
  } else if (src.type === 'FILE') {
    return src.file;
  } else if (src.type === 'URL') {
    return downloadTraceFromUrl(src.url);
  } else {
    throw new Error(`Loading to catapult from source with type ${src.type}`);
  }
}

function navigateWidgets(e: Event) {
  e.preventDefault();
  Router.navigate('#!/widgets');
}

function navigatePlugins(e: Event) {
  e.preventDefault();
  Router.navigate('#!/plugins');
}

function navigateQuery(e: Event) {
  e.preventDefault();
  Router.navigate('#!/query');
}

function navigateViewer(e: Event) {
  e.preventDefault();
  Router.navigate('#!/viewer');
}

function handleShareTrace(e: Event) {
  e.preventDefault();
  shareTrace();
}

function highPrecisionTimersAvailable(): boolean {
  // High precision timers are available either when the page is cross-origin
  // isolated or when the trace processor is a standalone binary.
  return (
    window.crossOriginIsolated ||
    AppImpl.instance.trace?.engine.mode === 'HTTP_RPC'
  );
}

class EngineRPCWidget implements m.ClassComponent<OptionalTraceAttrs> {
  view({attrs}: m.CVnode<OptionalTraceAttrs>) {
    let cssClass = '';
    let title = 'Number of pending SQL queries';
    let label: string;
    let failed = false;
    let mode: EngineMode | undefined;

    const engine = attrs.trace?.engine;
    if (engine !== undefined) {
      mode = engine.mode;
      if (engine.failed !== undefined) {
        cssClass += '.red';
        title = 'Query engine crashed\n' + engine.failed;
        failed = true;
      }
    }

    // If we don't have an engine yet, guess what will be the mode that will
    // be used next time we'll create one. Even if we guess it wrong (somehow
    // trace_controller.ts takes a different decision later, e.g. because the
    // RPC server is shut down after we load the UI and cached httpRpcState)
    // this will eventually become  consistent once the engine is created.
    if (mode === undefined) {
      if (
        globals.httpRpcState.connected &&
        AppImpl.instance.newEngineMode === 'USE_HTTP_RPC_IF_AVAILABLE'
      ) {
        mode = 'HTTP_RPC';
      } else {
        mode = 'WASM';
      }
    }

    if (mode === 'HTTP_RPC') {
      cssClass += '.green';
      label = 'RPC';
      title += '\n(Query engine: native accelerator over HTTP+RPC)';
    } else {
      label = 'WSM';
      title += '\n(Query engine: built-in WASM)';
    }

    const numReqs = attrs.trace?.engine.numRequestsPending ?? 0;
    return m(
      `.dbg-info-square${cssClass}`,
      {title},
      m('div', label),
      m('div', `${failed ? 'FAIL' : numReqs}`),
    );
  }
}

const ServiceWorkerWidget: m.Component = {
  view() {
    let cssClass = '';
    let title = 'Service Worker: ';
    let label = 'N/A';
    const ctl = globals.serviceWorkerController;
    if (!('serviceWorker' in navigator)) {
      label = 'N/A';
      title += 'not supported by the browser (requires HTTPS)';
    } else if (ctl.bypassed) {
      label = 'OFF';
      cssClass = '.red';
      title += 'Bypassed, using live network. Double-click to re-enable';
    } else if (ctl.installing) {
      label = 'UPD';
      cssClass = '.amber';
      title += 'Installing / updating ...';
    } else if (!navigator.serviceWorker.controller) {
      label = 'N/A';
      title += 'Not available, using network';
    } else {
      label = 'ON';
      cssClass = '.green';
      title += 'Serving from cache. Ready for offline use';
    }

    const toggle = async () => {
      if (globals.serviceWorkerController.bypassed) {
        globals.serviceWorkerController.setBypass(false);
        return;
      }
      showModal({
        title: 'Disable service worker?',
        content: m(
          'div',
          m(
            'p',
            `If you continue the service worker will be disabled until
                      manually re-enabled.`,
          ),
          m(
            'p',
            `All future requests will be served from the network and the
                    UI won't be available offline.`,
          ),
          m(
            'p',
            `You should do this only if you are debugging the UI
                    or if you are experiencing caching-related problems.`,
          ),
          m(
            'p',
            `Disabling will cause a refresh of the UI, the current state
                    will be lost.`,
          ),
        ),
        buttons: [
          {
            text: 'Disable and reload',
            primary: true,
            action: () => {
              globals.serviceWorkerController
                .setBypass(true)
                .then(() => location.reload());
            },
          },
          {text: 'Cancel'},
        ],
      });
    };

    return m(
      `.dbg-info-square${cssClass}`,
      {title, ondblclick: toggle},
      m('div', 'SW'),
      m('div', label),
    );
  },
};

class SidebarFooter implements m.ClassComponent<OptionalTraceAttrs> {
  view({attrs}: m.CVnode<OptionalTraceAttrs>) {
    return m(
      '.sidebar-footer',
      m('.js-footer',
        m('a',
          { href: "https://janestreet.com/join-jane-street/", title: "Jane Street", target: "_blank" },
          m(`img.js-logo[src=${globals.root}assets/LOGO_stacked_white.png]`)
         )
      ),
      m('.buttons-container',
        m(EngineRPCWidget, attrs),
        m(ServiceWorkerWidget),
        m(
          '.version',
          m(
            'a',
            {
              href: `${GITILES_URL}/+/${SCM_REVISION}/ui`,
              title: `Channel: ${getCurrentChannel()}`,
              target: '_blank',
            },
            VERSION,
          ),
        ),
      ),
    );
  }
}

class HiringBanner implements m.ClassComponent {
  view() {
    return m(
      '.hiring-banner',
      m(
        'a',
        {
          href: 'http://go/perfetto-open-roles',
          target: '_blank',
        },
        "We're hiring!",
      ),
    );
  }
}

export class Sidebar implements m.ClassComponent<OptionalTraceAttrs> {
  private _redrawWhileAnimating = new Animation(() => raf.scheduleFullRedraw());
  view({attrs}: m.CVnode<OptionalTraceAttrs>) {
    if (AppImpl.instance.sidebar.sidebarHidden) return null;
    const vdomSections = [];
    for (const section of getSections(attrs.trace)) {
      if (section.hideIfNoTraceLoaded && !isTraceLoaded()) continue;
      const vdomItems = [];
      for (const item of section.items) {
        if (item.isVisible !== undefined && !item.isVisible()) {
          continue;
        }
        let css = '';
        let attrs = {
          onclick: typeof item.a === 'function' ? item.a : null,
          href: isString(item.a) ? item.a : '#',
          target: isString(item.a) ? '_blank' : null,
          disabled: false,
          id: item.t.toLowerCase().replace(/[^\w]/g, '_'),
        };
        if (item.isPending && item.isPending()) {
          attrs.onclick = (e) => e.preventDefault();
          css = '.pending';
        }
        if (item.internalUserOnly && !globals.isInternalUser) {
          continue;
        }
        if (item.checkMetatracingEnabled || item.checkMetatracingDisabled) {
          if (
            item.checkMetatracingEnabled === true &&
            !isMetatracingEnabled()
          ) {
            continue;
          }
          if (
            item.checkMetatracingDisabled === true &&
            isMetatracingEnabled()
          ) {
            continue;
          }
          if (
            item.checkMetatracingDisabled &&
            !highPrecisionTimersAvailable()
          ) {
            attrs.disabled = true;
          }
        }
        if (item.checkDownloadDisabled && !isDownloadable()) {
          attrs = {
            onclick: (e) => {
              e.preventDefault();
              alert('Can not download external trace.');
            },
            href: '#',
            target: null,
            disabled: true,
            id: '',
          };
        }
        vdomItems.push(
          m(
            'li',
            m(
              `a${css}`,
              {...attrs, title: item.title},
              m('i.material-icons', item.i),
              item.t,
            ),
          ),
        );
      }
      if (section.appendOpenedTraceTitle) {
        if (globals.traceContext.traceTitle) {
          const {traceTitle, traceUrl} = globals.traceContext;
          vdomItems.unshift(m('li', createTraceLink(traceTitle, traceUrl)));
        }
      }
      vdomSections.push(
        m(
          `section${section.expanded ? '.expanded' : ''}`,
          m(
            '.section-header',
            {
              onclick: () => {
                section.expanded = !section.expanded;
                raf.scheduleFullRedraw();
              },
            },
            m('h1', {title: section.summary}, section.title),
            m('h2', section.summary),
          ),
          m('.section-content', m('ul', vdomItems)),
        ),
      );
    }
    return m(
      'nav.sidebar',
      {
        class: globals.state.sidebarVisible ? 'show-sidebar' : 'hide-sidebar',
        // 150 here matches --sidebar-timing in the css.
        // TODO(hjd): Should link to the CSS variable.
        ontransitionstart: (e: TransitionEvent) => {
          if (e.target !== e.currentTarget) return;
          this._redrawWhileAnimating.start(150);
        },
        ontransitionend: (e: TransitionEvent) => {
          if (e.target !== e.currentTarget) return;
          this._redrawWhileAnimating.stop();
        },
      },
      shouldShowHiringBanner() ? m(HiringBanner) : null,
      m(
        `header.${getCurrentChannel()}`,
        m(`img[src=${globals.root}assets/brand.png].brand`),
        m(
          'button.sidebar-button',
          {
            onclick: () => {
              globals.commandManager.runCommand(
                'perfetto.CoreCommands#ToggleLeftSidebar',
              );
            },
          },
          m(
            'i.material-icons',
            {
              title: globals.state.sidebarVisible ? 'Hide menu' : 'Show menu',
            },
            'menu',
          ),
        ),
      ),
      m(
        '.sidebar-scroll',
        m(
          '.sidebar-scroll-container',
          ...vdomSections,
          m(SidebarFooter, attrs),
        ),
      ),
    );
  }
}
