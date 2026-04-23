"use client";

import React, { useState } from "react";
import ModalWrapper from "../../common/modal/ModalWrapper";
import ModalBody from "../../common/modal/ModalBody";
import ProfileIcon from "@/icons/ProfileIcon";
import SecurityIcon from "@/icons/SecurityIcon";
import ProfileContent from "./ProfileContent";
import { LogoutIcon } from "@/icons";
import SecurityPrivacyContent from "./SecurityPrivacyContent";

const ProfileSettingTabs = [
  {
    id: 1,
    key: "profile",
    label: "Profile",
    icon: ProfileIcon,
  },
  {
    id: 2,
    key: "security",
    label: "Security",
    icon: SecurityIcon,
  },
];

const ProfileSettingModal = ({ onClose }: { onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <ModalWrapper isOpen={true} onClose={onClose} size="full">
      {/* IMPORTANT: give height */}
      <ModalBody className="flex flex-col md:flex-row gap-4 h-full">
        {/* Sidebar */}
        <div className="bg-grayBg p-3 md:p-5 rounded-lg flex flex-col w-full md:w-[260px]">
          {/* Header */}
          <h2 className="text-blackColor text-lg md:text-xl font-semibold mb-3 md:mb-6">
            Profile Setting
          </h2>

          {/* Tabs + Bottom Layout */}
          <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex flex-row md:flex-col gap-2 border-0 md:border-b border-borderColor pb-2">
              {ProfileSettingTabs.map((item) => {
                const active = activeTab === item.key;

                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveTab(item.key)}
                    className={`
                      flex flex-1 items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200
                      ${
                        active
                          ? "gradient-bg text-white"
                          : "hover:bg-gray-100 text-descriptionColor"
                      }
                    `}
                  >
                    <item.icon />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Logout (BOTTOM) */}
            <div className="mt-auto pt-0 sm:pt-4 flex justify-center md:justify-start">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-red-50">
                <LogoutIcon color="#EB3D4D" />
                <span className="text-sm font-medium text-[#EB3D4D]">
                  Logout
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileContent />}
          {activeTab === "security" && <SecurityPrivacyContent />}
        </div>
      </ModalBody>
    </ModalWrapper>
  );
};

export default ProfileSettingModal;
