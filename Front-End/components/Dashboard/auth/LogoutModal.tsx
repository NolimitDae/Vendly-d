import React from "react";
import ModalWrapper from "../common/modal/ModalWrapper";
import LogoutRed from "@/icons/LogoutRed";
import GenericButton from "./GenericButton";

const LogoutModal = ({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex flex-col items-center justify-center space-y-10 p-4 sm:p-10">
        <div className="logout-icon-wrapper w-[80px] h-[80px] flex justify-center items-center">
          <LogoutRed />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-blackColor leading-[130%] text-center">
            Are you sure you want to Logout?
          </h2>
          <p className="text-center text-grayColor! leading-[130%] text-lg">
            Thank you and see you again
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 w-full gap-3">
          <GenericButton
            onClick={onClose}
            rounded="full"
            variant="outline"
            size="lg"
            fullWidth
          >
            Cancel
          </GenericButton>
          <GenericButton
            onClick={onConfirm}
            rounded="full"
            variant="primary"
            size="lg"
            fullWidth
          >
            Yes, Logout
          </GenericButton>
        </div>
      </div>
    </ModalWrapper>
  );
};

export default LogoutModal;
