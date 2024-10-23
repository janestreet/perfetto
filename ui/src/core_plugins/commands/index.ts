// Copyright (C) 2023 The Android Open Source Project
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

import {Time, time} from '../../base/time';
import {exists} from '../../base/utils';
import {Actions} from '../../common/actions';
import {globals} from '../../frontend/globals';
import {openInOldUIWithSizeCheck} from '../../frontend/legacy_trace_viewer';
import {Trace} from '../../public/trace';
import {App} from '../../public/app';
import {PerfettoPlugin, PluginDescriptor} from '../../public/plugin';
import {
  isLegacyTrace,
  openFileWithLegacyTraceViewer,
} from '../../frontend/legacy_trace_viewer';
import {AppImpl} from '../../core/app_impl';
import {Router} from '../../core/router';
import {addQueryResultsTab} from '../../public/lib/query_table/query_result_tab';

const SQL_STATS = `
with first as (select started as ts from sqlstats limit 1)
select
    round((max(ended - started, 0))/1e6) as runtime_ms,
    round((started - first.ts)/1e6) as t_start_ms,
    query
from sqlstats, first
order by started desc`;

class CoreCommandsPlugin implements PerfettoPlugin {
  onActivate(ctx: App) {
    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#ToggleLeftSidebar',
      name: 'Toggle left sidebar',
      callback: () => {
        if (globals.state.sidebarVisible) {
          globals.dispatch(
            Actions.setSidebar({
              visible: false,
            }),
          );
        } else {
          globals.dispatch(
            Actions.setSidebar({
              visible: true,
            }),
          );
        }
      },
      defaultHotkey: '!Mod+B',
    });

    const input = document.createElement('input');
    input.classList.add('trace_file');
    input.setAttribute('type', 'file');
    input.style.display = 'none';
    input.addEventListener('change', onInputElementFileSelectionChanged);
    document.body.appendChild(input);

    const OPEN_TRACE_COMMAND_ID = 'perfetto.CoreCommands#openTrace';
    ctx.commands.registerCommand({
      id: OPEN_TRACE_COMMAND_ID,
      name: 'Open trace file',
      callback: () => {
        delete input.dataset['useCatapultLegacyUi'];
        input.click();
        Router.navigate('#!/viewer');
      },
      defaultHotkey: '!Mod+O',
    });
    ctx.sidebar.addMenuItem({
      commandId: OPEN_TRACE_COMMAND_ID,
      group: 'navigation',
      icon: 'folder_open',
    });
  }

  async onTraceLoad(ctx: Trace): Promise<void> {
    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#DebugSqlPerformance',
      name: 'Debug SQL performance',
      callback: () => {
        addQueryResultsTab(ctx, {
          query: SQL_STATS,
          title: 'Recent SQL queries',
        });
      },
    });

    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#UnpinAllTracks',
      name: 'Unpin all pinned tracks',
      callback: () => {
        const workspace = ctx.workspace;
        workspace.pinnedTracks.forEach((t) => workspace.unpinTrack(t));
      },
    });

    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#ExpandAllGroups',
      name: 'Expand all track groups',
      callback: () => {
        ctx.workspace.flatTracks.forEach((track) => track.expand());
      },
    });

    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#CollapseAllGroups',
      name: 'Collapse all track groups',
      callback: () => {
        ctx.workspace.flatTracks.forEach((track) => track.collapse());
      },
    });

    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#PanToTimestamp',
      name: 'Pan to timestamp',
      callback: (tsRaw: unknown) => {
        if (exists(tsRaw)) {
          if (typeof tsRaw !== 'bigint') {
            throw Error(`${tsRaw} is not a bigint`);
          }
          ctx.timeline.panToTimestamp(Time.fromRaw(tsRaw));
        } else {
          // No args passed, probably run from the command palette.
          const ts = promptForTimestamp('Enter a timestamp');
          if (exists(ts)) {
            ctx.timeline.panToTimestamp(Time.fromRaw(ts));
          }
        }
      },
    });

    ctx.commands.registerCommand({
      id: 'perfetto.CoreCommands#ShowCurrentSelectionTab',
      name: 'Show current selection tab',
      callback: () => {
        ctx.tabs.showTab('current_selection');
      },
    });

    ctx.commands.registerCommand({
      id: 'createNewEmptyWorkspace',
      name: 'Create new empty workspace',
      callback: async () => {
        const workspaces = AppImpl.instance.trace?.workspaces;
        if (workspaces === undefined) return; // No trace loaded.
        const name = await ctx.omnibox.prompt('Give it a name...');
        if (name === undefined || name === '') return;
        workspaces.switchWorkspace(workspaces.createEmptyWorkspace(name));
      },
    });

    ctx.commands.registerCommand({
      id: 'switchWorkspace',
      name: 'Switch workspace',
      callback: async () => {
        const workspaces = AppImpl.instance.trace?.workspaces;
        if (workspaces === undefined) return; // No trace loaded.
        const options = workspaces.all.map((ws) => {
          return {key: ws.id, displayName: ws.title};
        });
        const workspaceId = await ctx.omnibox.prompt(
          'Choose a workspace...',
          options,
        );
        if (workspaceId === undefined) return;
        const workspace = workspaces.all.find((ws) => ws.id === workspaceId);
        if (workspace) {
          workspaces.switchWorkspace(workspace);
        }
      },
    });
  }
}

function promptForTimestamp(message: string): time | undefined {
  const tsStr = window.prompt(message);
  if (tsStr !== null) {
    try {
      return Time.fromRaw(BigInt(tsStr));
    } catch {
      window.alert(`${tsStr} is not an integer`);
    }
  }
  return undefined;
}

function onInputElementFileSelectionChanged(e: Event) {
  if (!(e.target instanceof HTMLInputElement)) {
    throw new Error('Not an input element');
  }
  if (!e.target.files) return;
  const file = e.target.files[0];
  // Reset the value so onchange will be fired with the same file.
  e.target.value = '';

  if (e.target.dataset['useCatapultLegacyUi'] === '1') {
    openWithLegacyUi(file);
    return;
  }

  AppImpl.instance.analytics.logEvent('Trace Actions', 'Open trace from file');
  AppImpl.instance.openTraceFromFile(file);
}

async function openWithLegacyUi(file: File) {
  // Switch back to the old catapult UI.
  AppImpl.instance.analytics.logEvent(
    'Trace Actions',
    'Open trace in Legacy UI',
  );
  if (await isLegacyTrace(file)) {
    openFileWithLegacyTraceViewer(file);
    return;
  }
  openInOldUIWithSizeCheck(file);
}

export const plugin: PluginDescriptor = {
  pluginId: 'perfetto.CoreCommands',
  plugin: CoreCommandsPlugin,
};
