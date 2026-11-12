import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileViewer, { fileKind } from "./FileViewer";
import FileViewerHost from "./FileViewerHost";
import { openFile } from "@/lib/openFile";

describe("fileKind", () => {
  it("tells photos, PDFs and videos apart by type or extension", () => {
    expect(fileKind("https://media.test/deliverables/a.JPG")).toBe("image");
    expect(fileKind("https://media.test/deliverables/a.pdf?sig=1")).toBe("pdf");
    expect(fileKind("https://media.test/deliverables/a.mov")).toBe("video");
    expect(fileKind("https://media.test/deliverables/a.docx")).toBe("other");
    expect(fileKind("https://api.test/files/t1", "application/pdf")).toBe("pdf");
  });
});

describe("FileViewer", () => {
  it("shows a PDF on the page with share, open full screen and close", async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<FileViewer url="https://media.test/c.pdf" name="Signed contract" onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Signed contract" })).toBeInTheDocument();
    expect(screen.getByTitle("Signed contract")).toHaveAttribute("src", "https://media.test/c.pdf");
    expect(screen.getByRole("button", { name: "Share Signed contract" })).toBeInTheDocument();
    const open = screen.getByRole("link", { name: "Open Signed contract full screen" });
    expect(open).toHaveAttribute("href", "https://media.test/c.pdf");
    expect(open).toHaveAttribute("target", "_blank");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shares the link (copied when the browser can't share)", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<FileViewer url="https://media.test/p.jpg" name="Photo" onClose={() => {}} />);
    expect(screen.getByRole("img", { name: "Photo" })).toHaveAttribute("src", "https://media.test/p.jpg");
    await user.click(screen.getByRole("button", { name: "Share Photo" }));
    expect(writeText).toHaveBeenCalledWith("https://media.test/p.jpg");
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument();
  });

  it("has no share button for private documents", () => {
    render(<FileViewer url="https://api.test/id/front" name="Front of ID" mime="image/jpeg" share={false} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /share/i })).not.toBeInTheDocument();
  });
});

describe("openFile", () => {
  it("opens the pop-up when the page has one", async () => {
    render(<FileViewerHost />);
    act(() => openFile({ url: "https://media.test/v.mp4", name: "Highlights" }));
    expect(await screen.findByRole("dialog", { name: "Highlights" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
