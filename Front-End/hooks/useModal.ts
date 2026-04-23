import { useCallback, useState } from "react";

export const useModal = <T = any>() => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const openModal = useCallback((modalData?: T) => {
    if (modalData) {
      setData(modalData);
    }
    setIsOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);
  const toggleModal = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return { isOpen, data, openModal, closeModal, toggleModal, setIsOpen };
};
