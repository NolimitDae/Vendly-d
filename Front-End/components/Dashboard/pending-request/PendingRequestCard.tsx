"use client";
import DocIcon from "@/icons/DocIcon";
import React from "react";
import GenericButton from "../auth/GenericButton";

interface PendingRequestCardProps {
    data: {
        businessName: string;
        ownerName: string;
        status: string;
        category: string;
        subscriptionPlan: string;
        email: string;
        phone: string;
        submittedDocuments: string[];
        requestedOn: string;
    };
    onApprove?: () => void;
    onReject?: () => void;
}

const PendingRequestCard = ({
    data,
    onApprove,
    onReject,
}: PendingRequestCardProps) => {
    return (
        <div className="bg-grayBg rounded-xl p-4">

            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="space-y-0.5 ">
                    <h2 className="text-lg font-semibold text-blackColor leading-[160%]">
                        {data.businessName}
                    </h2>
                    <p className="text-sm text-descriptionColor leading-[160%]">{data.ownerName}</p>
                </div>

                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-pendingBg border-[0.5px] border-warningBorder">
                    <span className="text-pendingText">●</span> <span className="text-pendingText">{data.status}</span>
                </span>
            </div>

            {/* Divider */}
            <div className="border-t my-4" />

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                    <p className="text-descriptionColor leading-[160%] text-xs font-normal">Category</p>
                    <p className="font-semibold text-blackColor leading-[160%] text-xs">{data.category}</p>
                </div>

                <div>
                    <p className="text-descriptionColor leading-[160%] text-xs font-normal">Subscription Plan</p>
                    <p className="font-semibold text-blackColor leading-[160%] text-xs">
                        {data.subscriptionPlan}
                    </p>
                </div>

                <div>
                    <p className="text-descriptionColor leading-[160%] text-xs font-normal">Email</p>
                    <p className="font-semibold text-blackColor leading-[160%] text-xs">{data.email}</p>
                </div>

                <div>
                    <p className="text-descriptionColor leading-[160%] text-xs font-normal">Phone</p>
                    <p className="font-semibold text-blackColor leading-[160%] text-xs">{data.phone}</p>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t my-4" />

            {/* Documents */}
            <div>
                <p className="text-descriptionColor leading-[160%] text-xs font-medium mb-2">
                    Submitted Documents
                </p>

                <div className="flex flex-wrap gap-2">
                    {data.submittedDocuments.map((doc, index) => (
                        <span
                            key={index}
                            className="flex bg-white rounded-lg items-center gap-1.5 px-2.5 py-2 text-xs text-blackColor leading-[160%] font-normal border-[0.5px] border-borderColor"
                        >
                            <DocIcon /> <span>{doc}</span>
                        </span>
                    ))}
                </div>

                <p className="text-xs text-descriptionColor leading-[160%] font-medium  mt-2">
                    Requested on {data.requestedOn}
                </p>
            </div>

            {/* Divider */}
            <div className="border-t my-5" />

            {/* Actions */}
            <div className="flex gap-3">
                <GenericButton className="flex-1" onClick={onApprove} variant="primary" rounded="full" size="xll">Approve & Activate</GenericButton>
                <GenericButton className="flex-1" onClick={onReject} variant="outline" rounded="full" size="xll">Reject</GenericButton>
            </div>
        </div>
    );
};

export default PendingRequestCard;