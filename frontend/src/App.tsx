import { useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, } from "react-router-dom";
import {
  Box,
  CircularProgress,
  styled,
  Typography,
} from "@mui/material";
import { v4 as uuid } from 'uuid';
import { useTranslation } from "react-i18next";
import ReviewInfo from "./pages/ReviewInfo";
import { NAV_HEIGHT } from "./constants";
import SMSWaitingPage from "./pages/SMSWaitingPage";
import EnterPhonePage from "./pages/EnterPhonePage";
import ContinueAuth from "./pages/ContinueAuth";
import { AppEnv, exchangePublicTokenForAccessToken, SessionConfig } from "./services/ProveService";
import Logo from "./components/Logo";
import useMobileCheck from "./hooks/use-mobile-check";
import ResultPage from "./components/ResultPage";
import LangToggle from "./components/LangToggle";
import ThemeToggle from "./components/ThemeToggle";

const AppContainer = styled(Box)`
  width: 100%;
  height: 100%;
`;

const MainContainer = styled(Box)`
  display: flex;
  position: fixed;
  top: 0;
  left: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

const MainContent = styled(Box)(({ theme }) => ({
  flex: "0 0 auto",
  margin: "auto",
  borderRadius: "16px",
  width: "100%",
  minHeight: "320px",
  height: "100%",
  marginTop: "20px",
  [theme.breakpoints.up("sm")]: {
    width: "360px",
  },
}));

const CompWrapper = styled("main")`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  width: 100%;
  margin: 0;
  margin-top: 10px;
  flex-grow: 1;
  padding: 0 1.8rem;
`;

const Nav = styled("nav")`
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  height: ${NAV_HEIGHT};
`;

const NavLogo = styled("span")`
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 0.8rem;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.3px;
  img {
    width: 74px;
  }
`;

const NavIcons = styled("span")`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Layout = ({ children }: { children: any }) => {
  return (
    <MainContent className="fadeIn main-container">
      <Nav>
        <NavLogo>
          <Logo />
        </NavLogo>
        <NavIcons>
          <LangToggle />
          <ThemeToggle />
        </NavIcons>
      </Nav>
      <div id="animationWrapper">{children}</div>
    </MainContent>
  );
};

const App = () => {
  const isMobile = useMobileCheck();
  const location = useLocation();
  const { t } = useTranslation();
  const searchParams = new URLSearchParams(location.search);
  const vfp = searchParams.get('vfp');
  const sessionId = searchParams.get('sessionId') || `${uuid()}`;
  const userId = searchParams.get('userId') || "123456"; //!this is only for testing; please change for production 

  const sessionData = useRef<SessionConfig | null>()
  const accessToken = useRef<string>('');
  const appEnv = useRef<AppEnv>((import.meta.env.REACT_APP_ENV === AppEnv.PRODUCTION ? AppEnv.PRODUCTION : AppEnv.SANDBOX) as AppEnv);

  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [last4, setLast4] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [ready, setReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const exchangeTokenAndOpenApp = async (config: SessionConfig) => {
    try {
      const newConfigData = {
        sessionId: config.sessionId as string,
        userId: config.userId as string
      };
      sessionData.current = newConfigData;

      if (!sessionData.current?.sessionId) {
        alert('No session token provided');
        return;
      }

      // exchange public token for access token
      const exchangeResult = await exchangePublicTokenForAccessToken(sessionData.current!, isMobile);

      if (exchangeResult.data.access_token) {
        accessToken.current = (exchangeResult.data.access_token);
        // Allow the UI to be shown to the consumer 
        setReady(true);
      } else {
        throw new Error();
      }
    } catch (e: any) {
      setError('An error occurred while contacting our server. Please try again.')
    } finally {
      setLoading(false);
    }
  }

  const initApp = async (config: SessionConfig) => {
    try {
      //INITIAL LOAD OF CLIENT-SIDE APP
      await exchangeTokenAndOpenApp({
        sessionId: config.sessionId as string,
        userId: config.userId as string
      });
      setReady(true);
    } catch (e: any) {
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }

  const onAuthSuccessMobile = ({
    mobileAccessToken,
    last4,
  }: {
    mobileAccessToken: string;
    last4: string;
  }): void => {
    accessToken.current = mobileAccessToken as string;
    setLast4(last4);
    setReady(true);
  }

  useEffect(() => {
    console.log('Effect running with sessionId:', sessionId, 'and userId:', userId);
    if (!vfp) {
      initApp({ sessionId: sessionId, userId: userId });
    } else {
      setLoading(false);
      setReady(true);
    }
  }, []);

  // For the ContinueAuth path (when the user clicks the SMS link), we use a different router
  if (vfp) {
    return (
      <AppContainer>
        <Routes>
          <Route
            path="/:env?"
            element={
              <ContinueAuth
                vfp={vfp}
                env={appEnv.current}
              />}
          />
          <Route
            path="/redirect/:userAuthGuid"
            element={
              <ContinueAuth
                vfp={vfp}
                env={appEnv.current}
                isMobile={isMobile}
                isRedirected
                onAuthSuccessMobile={onAuthSuccessMobile}
              />
            }
          />
        </Routes>
      </AppContainer>
    )
  }

  return (
    <AppContainer className={"main-container"}>
      <MainContainer>
        {loading ? (
          <Box sx={{ background: "transparent", zIndex: 2147483648 }}>
            <CircularProgress />
          </Box>
        ) : (
          <CompWrapper>
            <Layout>
              {ready && !error ? (
                <Routes>
                  <Route
                    path="review"
                    element={
                      <ReviewInfo
                        accessToken={accessToken.current}
                        last4={last4}
                        onLast4Changed={setLast4}
                      />
                    }
                  />
                  <Route path="sms-waiting" element={
                    <SMSWaitingPage
                      phoneNumber={phoneNumber}
                      accessToken={accessToken.current!}
                      last4={last4}
                    />
                  } />
                  <Route path="verify-success" element={
                    <ResultPage status="success" />
                  } />
                  <Route path="verify-failure" element={
                    <ResultPage status="failure" />
                  } />
                  <Route path="*" element={
                    <EnterPhonePage
                      env={appEnv.current}
                      phoneNumber={phoneNumber}
                      onPhoneNumberChanged={setPhoneNumber}
                      last4={last4}
                      onLast4Changed={setLast4}
                      accessToken={accessToken.current!}
                    />
                  } />
                </Routes>
              ) : (
                <MainContent display="flex">
                  <Typography
                    variant="caption"
                    textAlign="center"
                    sx={{
                      lineHeight: "32px",
                      fontSize: "24px",
                      marginBottom: "32px",
                      marginTop: "32px",
                      p: 1,
                    }}
                  >
                    {error ||
                      t('global.genericError')
                    }
                  </Typography>
                </MainContent>
              )}
            </Layout>
          </CompWrapper>
        )}
      </MainContainer>
    </AppContainer>
  );
};

export default App;
