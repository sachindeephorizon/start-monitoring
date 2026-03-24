import { post } from "./config"

export const callSessionTokenGenerate = async () : Promise<string> => {
    const res = await post(`/call-sessions/token`)
    return res.data
}