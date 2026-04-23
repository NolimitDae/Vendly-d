"use client";
import { ChangePassIcon, FingerIcon, MacIcon, TrashTwo } from "@/icons";
import ToggleSwitch from "./ToggleSwitch";
import { useState } from "react";
import IpadIcon from "@/icons/IpadIcon";
import { Delete, Trash, Trash2 } from "lucide-react";
import TrashIcon from "@/icons/TrashIcon";

const devicesData = [
  {
    id: 1,
    name: "MacBook Pro (You)",
    version: "macOS 14",
    location: "Los Angeles, USA",
    lastActive: "Feb 15, 2025, 10:32 AM",
    isCurrent: true,
    icon: <MacIcon />,
  },
  {
    id: 2,
    name: "Windows PC (Edge)",
    version: "Windows 11",
    location: "New York, USA",
    lastActive: "Feb 15, 2025, 10:32 AM",
    isCurrent: false,
    icon: <MacIcon />,
  },
  {
    id: 3,
    name: "iPad Air (Firefox)",
    version: "iPadOS 17",
    location: "Houston, Texas",
    lastActive: "Feb 15, 2025, 10:32 AM",
    isCurrent: false,
    icon: <IpadIcon />,
  },
];

const SecurityPrivacyContent = () => {
  const [enabled, setEnabled] = useState(true);
  return (
    <div>
      <h2 className="text-blackColor text-lg md:text-[1.25rem] font-semibold leading-7 tracking-[-0.013rem]">
        Security & Privacy
      </h2>

      <div className="p-3 rounded-lg bg-grayBg mt-3 space-y-3">
        <ChangePassIcon />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-blackColor text-base font-medium leading-[160%]">
              Change Password
            </h2>
            <span className="bg-clip-text text-sm capitalize font-medium leading-[160%] text-transparent bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree">
              change
            </span>
          </div>
          <p className="text-descriptionColor text-sm font-normal leading-[160%]">
            Update your account password for enhanced security.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-grayBg mt-3 space-y-3">
        <FingerIcon />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-blackColor text-base font-medium leading-[160%]">
              Two-factor authentication (2FA)
            </h2>
            <ToggleSwitch checked={enabled} onChange={setEnabled} />
          </div>
          <p className="text-descriptionColor text-sm font-normal leading-[160%]">
            Enable an extra layer of security for account login.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-grayBg my-3 space-y-3">
        <h2 className="text-blackColor text-base font-medium leading-[160%]">
          Device Management
        </h2>

        <div className="space-y-3">
          {devicesData.map((device) => (
            <div key={device.id} className="flex items-center gap-3">
              <div className="w-[2.5rem] h-[2.5rem] flex items-center justify-center bg-white rounded-lg border-[0.5px] border-borderColor">
                {device.icon}
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-blackColor text-sm font-medium leading-[160%]">
                  {device.name}
                </h3>

                <div className="flex flex-col sm:flex-row justify-start md:items-center gap-1 md:gap-4">
                  {" "}
                  <p className="text-descriptionColor text-xs font-normal leading-[160%]">
                    {device.location}
                  </p>
                  <p className="text-descriptionColor text-xs font-normal leading-[160%]">
                    Last Active: {device.lastActive}
                  </p>{" "}
                </div>
              </div>
              <TrashTwo />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default SecurityPrivacyContent;
