import { useEffect, useState } from "react";
import { UserService } from "../service/user/user.service";

/**
 * Return user details from server use in component
 * @returns
 */
export function useUser(context = null) {
  const [user, setUser] = useState(null);

  const getUser = async () => {
    const res = await UserService.getUserDetails(context);
    let userData = null;

    if (res.data.status == "success") {
      userData = await res.data.data;
    } else {
      userData = null;
    }
    setUser(userData);
  };

  useEffect(() => {
    getUser();
  }, []);

  return user;
}

/**
 * Return user details from server use in serversideprops
 * @returns
 */
export async function getUser(context = null) {
  let userData = null;
  try {
    const res = await UserService.getUserDetails(context);

    if (res.data.error) {
      userData = null;
    } else {
      userData = res.data.data;
    }
  } catch (error) {
    userData = null;
  }

  return userData;
}
