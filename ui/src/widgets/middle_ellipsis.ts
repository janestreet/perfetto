// Copyright (C) 2024 The Android Open Source Project
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

export interface MiddleEllipsisAttrs {
  text: string;
  endChars?: number;
}

function replaceLeadingTrailingSpacesWithNbsp(text: string) {
  return text.replace(/^\s+|\s+$/g, function (match) {
    return '\u00A0'.repeat(match.length);
  });
}

/**
 * Puts ellipsis in the middle of a long string, rather than putting them at
 * either end, for occasions where the start and end of the text are more
 * important than the middle.
 */
export class MiddleEllipsis implements m.ClassComponent<MiddleEllipsisAttrs> {
  view({attrs, children}: m.Vnode<MiddleEllipsisAttrs>): m.Children {
    let {text, endChars = text.length > 16 ? 10 : 0} = attrs;
    text = text.trim();

    // For strings that end in extra information in brackets, e.g. [pid=555], this ensures
    // that information is always fully visible.
    const match = (/\[[a-z|()]+=[0-9]+\]/).exec(text);
    const index = match !== null ? match.index : (text.length - endChars);
    const left = text.substring(0, index);
    const right = text.substring(index);

    return m(
      '.pf-middle-ellipsis',
      m(
        'span.pf-middle-ellipsis-left',
        replaceLeadingTrailingSpacesWithNbsp(left),
      ),
      m(
        'span.pf-middle-ellipsis-right',
        replaceLeadingTrailingSpacesWithNbsp(right),
      ),
      children,
    );
  }
}
