"use client";

import React from "react";
import GenericButton from "@/components/Dashboard/auth/GenericButton";
import { useRouter } from "next/navigation";

const ConfirmationPassForm = () => {
    const [showPassword, setShowPassword] = React.useState(false);
    const router = useRouter();

    const togglePasswordVisibility = () => {
        setShowPassword((prev) => !prev);
    };
    return (
        <div className="space-y-8">

            <GenericButton variant="primary" size="md" rounded="2xl" fullWidth height="lg" onClick={() => router.push("/login")}>
                Proceed to login
            </GenericButton>
        </div>
    );
};

export default ConfirmationPassForm;
