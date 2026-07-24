/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { describeSemanticTag, isSemanticTagList } from "../src/util/semantic-tags.js";

describe("isSemanticTagList", () => {
    it("accepts an array of semantic tag structs", () => {
        expect(isSemanticTagList([{ mfgCode: null, namespaceId: 8, tag: 2, label: null }])).to.be.true;
    });

    it("accepts an empty array", () => {
        expect(isSemanticTagList([])).to.be.true;
    });

    it("rejects undefined (attribute not read yet)", () => {
        expect(isSemanticTagList(undefined)).to.be.false;
    });

    it("rejects non-semtag arrays", () => {
        expect(isSemanticTagList([1, 2, 3])).to.be.false;
    });
});

describe("describeSemanticTag", () => {
    it("resolves a standard namespace and tag", () => {
        // CommonPosition (8) -> Top (2)
        const { text } = describeSemanticTag({ mfgCode: null, namespaceId: 8, tag: 2, label: null });
        expect(text).to.equal("Common Position → Top");
    });

    it("appends the label as a qualifier when present on a standard tag", () => {
        // CommonPosition (8) -> Row (5), qualified per spec by a numeric label
        const { text } = describeSemanticTag({ mfgCode: null, namespaceId: 8, tag: 5, label: "3" });
        expect(text).to.equal('Common Position → Row ("3")');
    });

    it("falls back to raw ids for an unrecognized standard namespace", () => {
        const { text } = describeSemanticTag({ mfgCode: null, namespaceId: 9999, tag: 1, label: null });
        expect(text).to.equal("Namespace 9999 → Tag 1");
    });

    it("falls back to raw ids for a tag id not defined within a known namespace", () => {
        // CommonPosition (8) only defines tags 0-6
        const { text } = describeSemanticTag({ mfgCode: null, namespaceId: 8, tag: 99, label: null });
        expect(text).to.equal("Common Position → Tag 99");
    });

    it("renders manufacturer-specific tags using their label, not the standard registry", () => {
        const { text } = describeSemanticTag({ mfgCode: 4874, namespaceId: 1, tag: 3, label: "CustomZone" });
        expect(text).to.equal("Mfg 0x130A: CustomZone");
    });

    it("renders manufacturer-specific tags without a label using the raw tag id", () => {
        const { text } = describeSemanticTag({ mfgCode: 4874, namespaceId: 1, tag: 3, label: null });
        expect(text).to.equal("Mfg 0x130A tag 3");
    });
});
