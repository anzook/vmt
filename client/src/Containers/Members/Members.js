// ALSO CONSIDER MOVING GRANTACCESS() FROM COURSE CONTAINER TO HERE
// EXTRACT OUT THE LAYOUT PORTION INTO THE LAYYOUT FOLDER
import React, { PureComponent, Fragment } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { NavLink } from 'react-router-dom';
import { Member, Search, Modal, Button, InfoBox } from 'Components';
import Slider from 'Components/UI/Button/Slider';
import COLOR_MAP from 'utils/colorMap';
import API from 'utils/apiRequests';
import {
  grantAccess,
  updateCourseMembers,
  updateRoomMembers,
  inviteToCourse,
  inviteToRoom,
  clearNotification,
  removeCourseMember,
  removeRoomMember,
} from 'store/actions';
import { getAllUsersInStore } from 'store/reducers';
import CourseCodeMemberImport from 'Components/Importer/CourseCodeMemberImport';
import Importer from '../../Components/Importer/Importer';
import SearchResults from './SearchResults';
import classes from './members.css';

class Members extends PureComponent {
  constructor(props) {
    super(props);
    const { searchedUsers } = this.props;
    this.state = {
      searchText: '',
      searchResults: searchedUsers,
      confirmingInvitation: false,
      userId: null,
      username: null,
      isCourseOnly: false,
      temporaryExclusion: [], // array of user ids to temporarily exclude from search results
    };
  }

  // When a Member is added to a Classlist,
  // Remove them from the temporaryExclusion list.
  // See Room.js: if the refresh rate is too long,
  // Members could have been added to a Classlist multiple times
  componentDidUpdate() {
    const { classList } = this.props;
    const { temporaryExclusion } = this.state;
    const classIds = classList.map((member) => member.user && member.user._id);

    const newExclusion = temporaryExclusion.filter(
      (id) => !classIds.includes(id)
    );
    if (temporaryExclusion.length !== newExclusion.length)
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ temporaryExclusion: newExclusion });
  }

  componentWillUnmount() {
    const { notifications, connectClearNotification } = this.props;
    if (notifications.length > 0) {
      notifications.forEach((ntf) => {
        if (ntf.notificationType === 'newMember') {
          connectClearNotification(ntf._id);
        }
      });
    }
  }

  inviteMember = (id, username, role = 'participant') => {
    let confirmingInvitation = false;
    const {
      resourceId,
      resourceType,
      courseMembers,
      connectInviteToCourse,
      connectInviteToRoom,
      classList,
    } = this.props;
    const color = COLOR_MAP[classList.length];
    if (resourceType === 'course') {
      // Don't invite someone if they are already in the course
      const alreadyInCourse =
        courseMembers && courseMembers.find((mem) => mem.user._id === id);
      if (!alreadyInCourse)
        connectInviteToCourse(resourceId, id, username, { role });
    } else if (courseMembers) {
      const inCourse = courseMembers.filter(
        (member) => member.user._id === id
      )[0];
      if (!inCourse) {
        confirmingInvitation = true;
      } else {
        connectInviteToRoom(resourceId, id, username, color, role); // @TODO **WHY** do we invite a user if they are already in the course?!?
      }
    } else {
      connectInviteToRoom(resourceId, id, username, color, role);
    }
    this.setState((prevState) => ({
      confirmingInvitation,
      // Remove the invited member from the search results
      searchResults: prevState.searchResults.filter((user) => user._id !== id),
      username: confirmingInvitation ? username : null,
      userId: confirmingInvitation ? id : null,
      temporaryExclusion: [...prevState.temporaryExclusion, id],
    }));
  };

  confirmInvitation = () => {
    const {
      parentResource,
      resourceId,
      connectInviteToCourse,
      connectInviteToRoom,
      classList,
    } = this.props;
    const color = COLOR_MAP[classList.length];
    const { userId, username } = this.state;
    connectInviteToCourse(parentResource, userId, username, {
      role: 'guest',
    });
    connectInviteToRoom(resourceId, userId, username, color);
    this.setState({
      confirmingInvitation: false,
      username: null,
      userId: null,
    });
  };

  removeMember = (info) => {
    const {
      resourceId,
      resourceType,
      connectRemoveCourseMember,
      connectRemoveRoomMember,
    } = this.props;
    if (resourceType === 'course') {
      connectRemoveCourseMember(resourceId, info.user._id);
    } else connectRemoveRoomMember(resourceId, info.user._id);
  };

  removeAllMembers = () => {
    const {
      resourceId,
      resourceType,
      courseMembers,
      connectRemoveCourseMember,
    } = this.props;
    if (resourceType !== 'course') return;
    const membersToRemove = courseMembers.filter(
      (mem) => mem.role !== 'facilitator'
    );
    Promise.all(
      membersToRemove.map((mem) =>
        connectRemoveCourseMember(resourceId, mem.user._id)
      )
    );
  };

  // Consider finding a way to NOT duplicate this in MakeRooms and also now in Profile
  search = (text) => {
    const { classList, courseMembers } = this.props;
    const { isCourseOnly, temporaryExclusion } = this.state;
    if (text.length > 0) {
      // prettier-ignore
      API.search(
        'user',
        text
      )
        .then((res) => {
          const exclude = classList.map((member) => member.user._id).concat(temporaryExclusion)
          const searchResults = res.data.results.filter((user) => {
            if (user.accountType === 'temp') return false;
            if (isCourseOnly) {
              return courseMembers.some((mem) => mem.user._id === user._id);
            }
            if (exclude.includes(user._id)) return false;
            return true;
          });
          this.setState({ searchResults, searchText: text });
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.log('err: ', err);
        });
    } else {
      this.setState({ searchResults: [], searchText: text });
    }
  };

  /* Handler for the Import component */
  handleImport = (userObjects) => {
    Promise.all(
      userObjects.map(async (user) =>
        user._id
          ? API.put('user', user._id, user).then(() => {
              return user;
            })
          : API.post('user', user).then((res) => {
              return res.data.result;
            })
      )
    ).then((newUsers) =>
      newUsers.forEach((user) => this.inviteMember(user._id, user.username))
    );
  };

  /* Handler for the CourseCodeMemberImport component */
  handleCourseCodeMemberImport = (memberObjects) => {
    Promise.all(
      memberObjects.map(async (member) =>
        member.user._id
          ? API.put('user', member.user._id, member.user).then(() => {
              return member;
            })
          : API.post('user', member).then((res) => {
              return res.data.result;
            })
      )
    ).then((newMembers) =>
      newMembers.forEach((member) =>
        this.inviteMember(member.user._id, member.user.username, member.role)
      )
    );
  };

  render() {
    const {
      classList,
      notifications,
      owner,
      user,
      resourceType,
      resourceId,
      courseMembers,
      connectGrantAccess,
      connectClearNotification,
      onChangeRole,
    } = this.props;
    const {
      confirmingInvitation,
      username,
      searchResults,
      searchText,
      isCourseOnly,
    } = this.state;

    let joinRequests = <p>There are no new requests to join</p>;
    if (owner && notifications.length >= 1) {
      joinRequests = notifications
        .filter((ntf) => ntf.notificationType === 'requestAccess')
        .map((ntf) => {
          return (
            <Member
              grantAccess={() => {
                connectGrantAccess(
                  ntf.fromUser._id,
                  resourceType,
                  resourceId,
                  ntf._id,
                  ntf.toUser
                );
              }}
              resourceName={resourceType}
              rejectAccess={() => {
                connectClearNotification(ntf._id);
              }}
              info={ntf.fromUser}
              key={ntf._id}
            />
          );
        });
    }
    const filteredClassList = [];
    const guestList = [];
    classList.forEach((member) => {
      if (member.role === 'guest') {
        guestList.push(member);
      } else {
        filteredClassList.push(member);
      }
    });
    const classListComponents = filteredClassList.map((member) => {
      // at least sometimes member is just user object so there is no member.user property /// <-- well thats not good, how did that happen? this hsould be consistant
      const userId = member.user ? member.user._id : member._id;
      // checking for notification...newMember type indicates this user has added themself by entering the entryCode
      const notification = notifications.filter((ntf) => {
        if (ntf.fromUser && ntf.notificationType === 'newMember') {
          return ntf.fromUser._id === userId;
        }
        return false;
      });

      return owner ? (
        <Member
          changeRole={onChangeRole}
          removeMember={this.removeMember}
          info={member}
          key={member.user._id}
          resourceName={resourceType}
          notification={notification.length > 0}
          owner
        />
      ) : (
        <Member
          info={member}
          key={member.user._id}
          resourceName={resourceType}
        />
      );
    });

    const guestListComponents = guestList.map((member) => {
      return owner ? (
        <Member
          changeRole={onChangeRole}
          removeMember={this.removeMember}
          info={member}
          key={member.user._id}
          resourceName={resourceType}
          owner
        />
      ) : (
        <Member info={member} key={member.user._id} />
      );
    });
    return (
      <div className={classes.Container}>
        <Modal
          show={confirmingInvitation}
          closeModal={() => this.setState({ confirmingInvitation: false })}
        >
          <div>
            {username} is not in this course...you can still add them to this
            room and they will be added to the course as a guest
          </div>
          <div>
            <Button m={5} click={this.confirmInvitation}>
              Add To Room
            </Button>
            <Button
              theme="Cancel"
              m={5}
              click={() => {
                this.setState({ confirmingInvitation: false });
              }}
            >
              Cancel
            </Button>
          </div>
        </Modal>
        <div>
          {owner ? (
            <InfoBox
              title="Add Participants"
              icon={<i className="fas fa-user-plus" />}
              rightIcons={
                resourceType === 'course' ? (
                  <div
                    style={{
                      display: 'flex',
                      // width: '475px',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div className={classes.Instructions}>
                      <i className="far fa-question-circle fa-2x" />
                      <div className={classes.TooltipContent}>
                        <p>
                          The search bar allows for the searching and addition
                          of existing VMT Users. By using the Import feature,
                          new users can be created for your course. <br /> For
                          csv formatting and importing guides, please see the
                          VMT{' '}
                          <NavLink
                            exact
                            to="/instructions"
                            className={classes.Link}
                            activeStyle={{ borderBottom: '1px solid #2d91f2' }}
                          >
                            Instructions
                          </NavLink>
                        </p>
                      </div>
                    </div>
                    <Importer
                      user={user}
                      onImport={this.handleImport}
                      buttonText="Import New Members"
                      preImportText="Replace all existing members"
                      preImportAction={this.removeAllMembers}
                    />
                    <div style={{ margin: '0 1rem' }}>
                      {/* <Button>Shared Rosters</Button> */}
                      <CourseCodeMemberImport
                        onImport={this.handleCourseCodeMemberImport}
                        userId={user._id}
                      />
                    </div>
                  </div>
                ) : null
              }
            >
              <Fragment>
                <Search
                  data-testid="member-search"
                  _search={this.search}
                  placeholder="search existing VMT users by username or email address"
                />
                {searchResults.length > 0 ? (
                  <SearchResults
                    searchText={searchText}
                    usersSearched={searchResults.slice(0, 7)}
                    inviteMember={this.inviteMember}
                  />
                ) : null}
                {resourceType === 'room' && courseMembers ? (
                  <div className={classes.ToggleContainer}>
                    <Slider
                      data-testid="search-toggle"
                      action={() => {
                        this.setState(
                          (prevState) => ({
                            isCourseOnly: !prevState.isCourseOnly,
                          }),
                          () => {
                            this.search(searchText);
                          }
                        );
                      }}
                      isOn={isCourseOnly}
                      name="isCourseOnly"
                    />
                    <span className={classes.Email}>
                      {isCourseOnly
                        ? ' Toggle to Search all VMT users '
                        : ' Toggle to Search only for course members '}
                    </span>
                  </div>
                ) : null}
              </Fragment>
            </InfoBox>
          ) : null}
          {owner ? (
            <InfoBox
              title="New Requests to Join"
              icon={<i className="fas fa-bell" />}
            >
              <div data-testid="join-requests">{joinRequests}</div>
            </InfoBox>
          ) : null}
          <InfoBox title="Class List" icon={<i className="fas fa-users" />}>
            <div data-testid="members">{classListComponents}</div>
          </InfoBox>
          <InfoBox title="Guest List" icon={<i className="fas fa-id-badge" />}>
            <div data-testid="members">
              {guestListComponents.length > 0
                ? guestListComponents
                : `There are no guests in this ${resourceType}`}
            </div>
          </InfoBox>
        </div>
      </div>
    );
  }
}

Members.propTypes = {
  searchedUsers: PropTypes.arrayOf(PropTypes.shape({})),
  user: PropTypes.shape({ _id: PropTypes.string }).isRequired,
  notifications: PropTypes.arrayOf(PropTypes.shape({})),
  resourceId: PropTypes.string.isRequired,
  resourceType: PropTypes.string.isRequired,
  courseMembers: PropTypes.arrayOf(PropTypes.shape({})), // the (unsorted) course members array or null, if we aren't in a course
  owner: PropTypes.bool.isRequired,
  parentResource: PropTypes.string,
  // if a course, classList is the course members array, sorted with participants then facilitators.
  // If a room, this is just the members array
  classList: PropTypes.arrayOf(PropTypes.shape({})),
  connectGrantAccess: PropTypes.func.isRequired,
  connectInviteToCourse: PropTypes.func.isRequired,
  connectInviteToRoom: PropTypes.func.isRequired,
  connectClearNotification: PropTypes.func.isRequired,
  connectRemoveRoomMember: PropTypes.func.isRequired,
  connectRemoveCourseMember: PropTypes.func.isRequired,
  // if a course, keys are room ids, values are the array of room members. If a room, this is an empty array
  courseRoomsMembers: PropTypes.shape({}),
  onChangeRole: PropTypes.func,
  course: PropTypes.shape({
    archive: PropTypes.shape({ rooms: PropTypes.arrayOf(PropTypes.string) }),
  }),
};

Members.defaultProps = {
  searchedUsers: [],
  classList: [],
  courseMembers: null,
  notifications: null,
  parentResource: null,
  courseRoomsMembers: null,
  onChangeRole: null,
  course: null,
};

const mapStateToProps = (state, ownProps) => {
  // STart the search results populated with people already in the store
  const usersToExclude = ownProps.classList.map((member) => member.user._id);
  const allUsers = getAllUsersInStore(state, usersToExclude);
  const userIds = [...allUsers.userIds].slice(0, 5);
  const usernames = [...allUsers.usernames].slice(0, 5);
  const course = (ownProps.course &&
    state.courses.byId[ownProps.course._id]) || {
    rooms: [],
  };
  return {
    searchedUsers: userIds.map((id, i) => ({
      _id: id,
      username: usernames[i],
    })),
    user: state.user,
    courseRoomsMembers: course.rooms.reduce((acc, roomId) => {
      return (
        state.rooms.byId[roomId] && {
          ...acc,
          [roomId]: state.rooms.byId[roomId].members,
        }
      );
    }, {}),
  };
};

// prettier-ignore
export default connect(mapStateToProps, {
  connectGrantAccess: grantAccess,
  connectUpdateCourseMembers: updateCourseMembers,
  connectUpdateRoomMembers: updateRoomMembers,
  connectInviteToCourse: inviteToCourse,
  connectInviteToRoom: inviteToRoom,
  connectClearNotification: clearNotification,
  connectRemoveRoomMember: removeRoomMember,
  connectRemoveCourseMember: removeCourseMember,
})(Members);
