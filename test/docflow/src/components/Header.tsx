import corporateLogo from '../assets/EN+_Logo_Rus_color.svg';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const styles = `
:root {
  /* Корпоративные цвета */
  --corp-dark-green: #00534C;
  --corp-light-blue: #769FB1;
  --corp-accent-orange: #FD5D39;

  /* Общие цвета */
  --main-black: #333;
  --main-white: #ffffff;
  --hover-blue: var(--corp-dark-green);
}

.header {
  display: flex;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 3px solid var(--corp-dark-green);
  background-color: var(--main-white);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.logo {
  width: 40px;
  height: 40px;
  margin-right: 1rem;
}

.tagline {
  font-weight: bold;
  font-size: 1.2rem;
  color: var(--corp-dark-green);
  margin-right: auto;
  padding-right: 20px;
}

.nav-menu {
  display: flex;
  align-items: center;
}

.nav-menu a {
  text-decoration: none;
  color: var(--main-black);
  margin-left: 20px;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-menu a:hover {
  color: var(--corp-dark-green);
}

.login-btn-container {
  margin-left: 30px;
  padding-left: 30px;
  border-left: 2px solid var(--corp-light-blue);
}

.btn-login {
  display: flex;
  gap: 8px;
  background-color: var(--corp-accent-orange);
  color: var(--main-white);
  border: 1px solid var(--corp-accent-orange);
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s, opacity 0.2s;
}

.btn-login:hover {
  background-color: #FD4D29;
  opacity: 0.9;
}

.btn-login svg {
  stroke: var(--main-white);
}

.user-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
  padding-right: 20px;
}

.admin-link {
  color: var(--corp-dark-green);
  font-weight: 600;
  text-decoration: none;
  padding: 6px 10px;
  border: 1px solid var(--corp-light-blue);
  border-radius: 6px;
  transition: background-color 0.2s, color 0.2s;
}

.admin-link:hover {
  background-color: var(--corp-dark-green);
  color: var(--main-white);
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #2d3748;
}

.logout-btn {
  padding: 8px 16px;
  background: #e53e3e;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: #c53030;
}

.version-tag {
  font-size: 0.75rem;
  color: var(--corp-light-blue);
  margin-left: 12px;
}
`;

const Header = () => {
  const { user, logout } = useAuth();
  return (
    <>
      <style>{styles}</style>
      <header className="header">
        <img src={corporateLogo} alt="Logo" className="logo" />
        <div className="tagline">Обработка документов</div>

        <nav className="nav-menu" />

        <div className="user-section">
          {user ? (
            <>
              <span className="user-name">{user.full_name?.trim() || user.username}</span>
              <button className="logout-btn" onClick={() => logout()}>
                Выйти
              </button>
            </>
          ) : (
            <div className="login-btn-container">
              <Link to="/login" className="btn-login">
                Войти
              </Link>
            </div>
          )}
        </div>
      </header>
    </>
  );
};

export default Header;
