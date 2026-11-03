import { fireEvent, render, screen } from "@testing-library/react";
import PhotoViewer from "./PhotoViewer";

jest.mock("next/image", () => ({ __esModule: true, default: ({ fill: _f, priority: _p, ...props }: any) => <img {...props} /> }));

describe("PhotoViewer", () => {
  const photos = ["https://media.test/a.jpg", "https://media.test/b.jpg", "https://media.test/c.jpg"];

  it("shows the photo full size and moves between photos with the arrows and keys", () => {
    const onIndex = jest.fn();
    render(<PhotoViewer photos={photos} index={0} onIndex={onIndex} onClose={jest.fn()} title="Garden arch" />);
    expect(screen.getByAltText("Garden arch, photo 1")).toHaveAttribute("src", photos[0]);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(onIndex).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByLabelText("Previous photo"));
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenLastCalledWith(1);
  });

  it("closes with Escape, the close button or a tap outside the photo, not a tap on it", () => {
    const onClose = jest.fn();
    render(<PhotoViewer photos={photos} index={1} onIndex={jest.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByAltText("Photo 2"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("Close"));
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("has no arrows or counter for a single photo", () => {
    render(<PhotoViewer photos={[photos[0]]} index={0} onIndex={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByLabelText("Next photo")).not.toBeInTheDocument();
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });
});
